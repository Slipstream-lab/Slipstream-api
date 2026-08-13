import { NotFoundException } from '@nestjs/common';
import { SlipstreamCoreService } from '../../src/core/slipstream-core.service';
import { MockCoreRunner } from '../../src/core/mock-core-runner';
import { NoopQueueService } from '../../src/queue/noop-queue.service';
import { AnalysisService } from '../../src/modules/analysis/analysis.service';
import { AnalysisKindDto } from '../../src/modules/analysis/dto/create-analysis.dto';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Builds a fake PrismaService that records writes so we can assert the
 * orchestration persists an analysis + findings + grade for an inline SCAN.
 */
function fakePrisma() {
  const state: {
    analysisCreated?: any;
    gradeCreated?: any;
    jobStatus: string[];
  } = { jobStatus: [] };

  const job = { id: 'job1', contractId: 'c1', kind: 'SCAN' };

  return {
    state,
    contract: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        ecosystem: 'defi',
        gitRef: 'main',
      }),
    },
    analysisJob: {
      findUnique: jest.fn().mockResolvedValue(job),
      create: jest.fn().mockResolvedValue(job),
      update: jest.fn().mockImplementation(({ data }: any) => {
        if (data.status) state.jobStatus.push(data.status);
        return Promise.resolve({ ...job, ...data });
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...job, status: 'COMPLETED' }),
    },
    analysis: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => {
        state.analysisCreated = data;
        return Promise.resolve({ id: 'a1', ...data });
      }),
    },
    grade: {
      create: jest.fn().mockImplementation(({ data }: any) => {
        state.gradeCreated = data;
        return Promise.resolve({ id: 'g1', ...data });
      }),
    },
    gradeHistory: { create: jest.fn().mockResolvedValue({}) },
    leaderboardEntry: { upsert: jest.fn().mockResolvedValue({}) },
  };
}

function buildService(prisma: any) {
  const core = new SlipstreamCoreService(new MockCoreRunner());
  const queue = new NoopQueueService();
  return new AnalysisService(prisma as unknown as PrismaService, core, queue);
}

describe('AnalysisService', () => {
  it('throws NotFound when the contract does not exist', async () => {
    const prisma = fakePrisma();
    prisma.contract.findUnique.mockResolvedValueOnce(null);
    const service = buildService(prisma);
    await expect(
      service.create({ contractId: 'missing', kind: AnalysisKindDto.SCAN, path: '.' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('runs a SCAN inline (no queue) and persists analysis + findings + grade', async () => {
    const prisma = fakePrisma();
    const service = buildService(prisma);

    await service.create({
      contractId: 'c1',
      kind: AnalysisKindDto.SCAN,
      path: '/repo',
    });

    // An analysis was created with detector findings from the mock scan.
    expect(prisma.analysis.create).toHaveBeenCalled();
    expect(prisma.state.analysisCreated.findings.create.length).toBe(2);
    expect(prisma.state.analysisCreated.detectorFindings).toBe(2);

    // A grade was computed and persisted; leaderboard upserted.
    expect(prisma.grade.create).toHaveBeenCalled();
    expect(prisma.state.gradeCreated.letter).toBeDefined();
    expect(prisma.leaderboardEntry.upsert).toHaveBeenCalled();

    // Job transitioned RUNNING -> COMPLETED.
    expect(prisma.state.jobStatus).toContain('RUNNING');
    expect(prisma.state.jobStatus).toContain('COMPLETED');
  });

  it('marks the job FAILED when core invocation fails', async () => {
    const prisma = fakePrisma();
    const core = new SlipstreamCoreService(
      new MockCoreRunner({
        scan: { stdout: '', stderr: 'boom', exitCode: 1 },
      }),
    );
    const service = new AnalysisService(
      prisma as unknown as PrismaService,
      core,
      new NoopQueueService(),
    );

    await expect(
      service.create({
        contractId: 'c1',
        kind: AnalysisKindDto.SCAN,
        path: '.',
      }),
    ).rejects.toBeDefined();
    expect(prisma.state.jobStatus).toContain('FAILED');
  });
});

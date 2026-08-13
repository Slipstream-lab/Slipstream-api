import { SlipstreamCoreService } from '../../src/core/slipstream-core.service';
import { MockCoreRunner } from '../../src/core/mock-core-runner';
import { NoopQueueService } from '../../src/queue/noop-queue.service';
import { AnalysisService } from '../../src/modules/analysis/analysis.service';
import { AnalysisProcessor } from '../../src/queue/analysis.processor';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Fake PrismaService that records writes. `analysis.findUnique` consults the
 * in-memory stored row so the idempotency guard in `AnalysisService.processJob`
 * behaves like a real database on retries.
 */
function fakePrisma() {
  const state: { analysisCreated?: any; jobStatus: string[] } = { jobStatus: [] };
  let storedAnalysis: any = null;
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
      update: jest.fn().mockImplementation(({ data }: any) => {
        if (data.status) state.jobStatus.push(data.status);
        return Promise.resolve({ ...job, ...data });
      }),
    },
    analysis: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(where.jobId ? storedAnalysis : null),
        ),
      create: jest.fn().mockImplementation(({ data }: any) => {
        storedAnalysis = { id: 'a1', ...data };
        state.analysisCreated = data;
        return Promise.resolve(storedAnalysis);
      }),
    },
    grade: { create: jest.fn().mockResolvedValue({ id: 'g1' }) },
    gradeHistory: { create: jest.fn().mockResolvedValue({}) },
    leaderboardEntry: { upsert: jest.fn().mockResolvedValue({}) },
  };
}

function buildProcessor(prisma: any) {
  const core = new SlipstreamCoreService(new MockCoreRunner());
  const service = new AnalysisService(
    prisma as unknown as PrismaService,
    core,
    new NoopQueueService(),
  );
  return new AnalysisProcessor(service);
}

function queueJob(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'q1',
    name: 'analysis',
    data: {
      analysisJobId: 'job1',
      contractId: 'c1',
      kind: 'SCAN',
      path: '/repo',
      ...overrides,
    },
  };
}

describe('AnalysisProcessor (worker path)', () => {
  it('persists a SCAN via the shared AnalysisService.processJob', async () => {
    const prisma = fakePrisma();
    const processor = buildProcessor(prisma);

    await processor.process(queueJob());

    // Analysis + findings + grade + leaderboard all persisted, exactly as the
    // inline path does.
    expect(prisma.analysis.create).toHaveBeenCalled();
    expect(prisma.state.analysisCreated.findings.create.length).toBe(2);
    expect(prisma.state.analysisCreated.detectorFindings).toBe(2);
    expect(prisma.grade.create).toHaveBeenCalled();
    expect(prisma.leaderboardEntry.upsert).toHaveBeenCalled();
    expect(prisma.state.jobStatus).toContain('RUNNING');
    expect(prisma.state.jobStatus).toContain('COMPLETED');
  });

  it('is idempotent per job id (safe to retry)', async () => {
    const prisma = fakePrisma();
    const processor = buildProcessor(prisma);

    // Simulate a broker redelivery: the same job processed twice.
    await processor.process(queueJob());
    await processor.process(queueJob());

    expect(prisma.analysis.create).toHaveBeenCalledTimes(1);
    expect(prisma.grade.create).toHaveBeenCalledTimes(1);
    expect(prisma.leaderboardEntry.upsert).toHaveBeenCalledTimes(1);
  });

  it('propagates core failures and marks the job FAILED', async () => {
    const prisma = fakePrisma();
    const core = new SlipstreamCoreService(
      new MockCoreRunner({ scan: { stdout: '', stderr: 'boom', exitCode: 1 } }),
    );
    const service = new AnalysisService(
      prisma as unknown as PrismaService,
      core,
      new NoopQueueService(),
    );
    const processor = new AnalysisProcessor(service);

    await expect(processor.process(queueJob())).rejects.toBeDefined();
    expect(prisma.state.jobStatus).toContain('FAILED');
  });
});

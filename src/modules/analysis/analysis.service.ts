import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Analysis, AnalysisJob, AnalysisKind, AnalysisStatus, Prisma } from '@prisma/client';
import { SlipstreamCoreService } from '../../core/slipstream-core.service';
import { AnalysisReport, ProfileReport, renderLedgerKey } from '../../core/core.types';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_SERVICE, QueueService } from '../../queue/queue.service';
import { AnalysisJobData } from '../../queue/queue.constants';
import { AnalysisKindDto, CreateAnalysisDto } from './dto/create-analysis.dto';
import { ComputedGrade, gradeFromProfile, gradeFromScan } from './grade';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly core: SlipstreamCoreService,
    @Inject(QUEUE_SERVICE) private readonly queue: QueueService,
  ) {}

  /**
   * Create an analysis job for a contract. Either enqueues it (when a Redis
   * worker is available and `runInline` is not set) or runs it synchronously
   * and persists the result.
   */
  async create(dto: CreateAnalysisDto): Promise<AnalysisJob> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
    });
    if (!contract) {
      throw new NotFoundException(`Contract ${dto.contractId} not found`);
    }

    const kind = dto.kind as unknown as AnalysisKind;
    const payload: Prisma.InputJsonValue = {
      path: dto.path ?? null,
      fixture: dto.fixture ?? null,
      left: dto.left ?? null,
      right: dto.right ?? null,
    };

    const job = await this.prisma.analysisJob.create({
      data: {
        contractId: dto.contractId,
        kind,
        status: AnalysisStatus.PENDING,
        payload,
      },
    });

    const runInline = dto.runInline || !this.queue.enabled;
    if (runInline) {
      // Process synchronously so callers/tests get a result without a broker.
      await this.runJob(job, dto);
      return this.prisma.analysisJob.findUniqueOrThrow({
        where: { id: job.id },
      });
    }

    const queueData: AnalysisJobData = {
      analysisJobId: job.id,
      contractId: dto.contractId,
      kind: dto.kind,
      path: dto.path,
      fixture: dto.fixture,
      left: dto.left,
      right: dto.right,
    };
    const queueJobId = await this.queue.enqueueAnalysis(queueData);
    return this.prisma.analysisJob.update({
      where: { id: job.id },
      data: { queueJobId, status: AnalysisStatus.PENDING },
    });
  }

  /** Fetch a completed analysis with its findings and hot keys. */
  async findOne(id: string): Promise<Analysis> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      include: { findings: true, hotKeys: true, grade: true },
    });
    if (!analysis) {
      throw new NotFoundException(`Analysis ${id} not found`);
    }
    return analysis;
  }

  /** List analyses for a contract, newest first. */
  async findForContract(contractId: string): Promise<Analysis[]> {
    return this.prisma.analysis.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
      include: { grade: true },
    });
  }

  async getJob(id: string): Promise<AnalysisJob> {
    const job = await this.prisma.analysisJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException(`Analysis job ${id} not found`);
    }
    return job;
  }

  /**
   * Runs a job's core command inline and persists the resulting Analysis,
   * findings, hot keys and grade. Marks the job COMPLETED or FAILED.
   */
  private async runJob(job: AnalysisJob, dto: CreateAnalysisDto): Promise<void> {
    await this.prisma.analysisJob.update({
      where: { id: job.id },
      data: { status: AnalysisStatus.RUNNING, startedAt: new Date() },
    });

    try {
      switch (dto.kind) {
        case AnalysisKindDto.SCAN:
          await this.persistScan(job, await this.core.scan(dto.path ?? '.'));
          break;
        case AnalysisKindDto.PROFILE:
          await this.persistProfile(job, await this.core.profile(dto.fixture ?? ''));
          break;
        case AnalysisKindDto.DIFF: {
          const report = await this.core.diff(dto.left ?? '', dto.right ?? '');
          await this.prisma.analysis.create({
            data: {
              contractId: job.contractId,
              jobId: job.id,
              kind: AnalysisKind.DIFF,
              status: AnalysisStatus.COMPLETED,
              detectorFindings: report.summary.detector_findings_delta,
              storageReads: report.summary.storage_reads_delta,
              storageWrites: report.summary.storage_writes_delta,
              rawReport: report as unknown as Prisma.InputJsonValue,
            },
          });
          break;
        }
      }
      await this.prisma.analysisJob.update({
        where: { id: job.id },
        data: { status: AnalysisStatus.COMPLETED, finishedAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Analysis job ${job.id} failed: ${message}`);
      await this.prisma.analysisJob.update({
        where: { id: job.id },
        data: {
          status: AnalysisStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: message,
          attempts: { increment: 1 },
        },
      });
      throw error;
    }
  }

  /** Persist a SCAN result: analysis + findings + grade + history + leaderboard. */
  private async persistScan(job: AnalysisJob, reports: AnalysisReport[]): Promise<Analysis> {
    const functionCount = reports.reduce((sum, r) => sum + r.functions.length, 0);
    const storageReads = reports.reduce(
      (sum, r) => sum + r.functions.reduce((s, f) => s + f.storage_reads.length, 0),
      0,
    );
    const storageWrites = reports.reduce(
      (sum, r) => sum + r.functions.reduce((s, f) => s + f.storage_writes.length, 0),
      0,
    );
    const findings = reports.flatMap((r) => r.detectors);
    const grade = gradeFromScan(reports);

    const analysis = await this.prisma.analysis.create({
      data: {
        contractId: job.contractId,
        jobId: job.id,
        kind: AnalysisKind.SCAN,
        status: AnalysisStatus.COMPLETED,
        source: reports[0]?.source ?? null,
        functionCount,
        storageReads,
        storageWrites,
        detectorFindings: findings.length,
        rawReport: reports as unknown as Prisma.InputJsonValue,
        findings: {
          create: findings.map((f) => ({
            detector: f.detector,
            function: f.function,
            key: f.key,
            message: f.message,
          })),
        },
      },
    });

    await this.applyGrade(job.contractId, analysis.id, grade, {
      detectorFindings: findings.length,
    });
    return analysis;
  }

  /** Persist a PROFILE result: analysis + hot keys + grade. */
  private async persistProfile(job: AnalysisJob, report: ProfileReport): Promise<Analysis> {
    const grade = gradeFromProfile(report);
    const analysis = await this.prisma.analysis.create({
      data: {
        contractId: job.contractId,
        jobId: job.id,
        kind: AnalysisKind.PROFILE,
        status: AnalysisStatus.COMPLETED,
        source: report.source,
        transactionCount: report.transaction_count,
        distinctKeys: report.distinct_keys,
        stageCount: report.stage_count,
        parallelism: report.parallelism,
        criticalPathLength: report.critical_path_length,
        weightedCriticalPathWeight: report.weighted_critical_path_weight,
        totalConflicts: report.total_conflicts,
        rawReport: report as unknown as Prisma.InputJsonValue,
        hotKeys: {
          create: report.hot_keys.map((hk) => ({
            key: renderLedgerKey(hk.key),
            reads: hk.reads,
            writes: hk.writes,
            touchCount: hk.touch_count,
          })),
        },
      },
    });

    await this.applyGrade(job.contractId, analysis.id, grade, {
      totalConflicts: report.total_conflicts,
      parallelism: report.parallelism,
    });
    return analysis;
  }

  /**
   * Writes the Grade, appends a GradeHistory row, and upserts the contract's
   * denormalized LeaderboardEntry. Ranks are recomputed by the leaderboard
   * service, not here.
   */
  private async applyGrade(
    contractId: string,
    analysisId: string,
    grade: ComputedGrade,
    metrics: {
      detectorFindings?: number;
      totalConflicts?: number;
      parallelism?: number;
    },
  ): Promise<void> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });

    await this.prisma.grade.create({
      data: {
        contractId,
        analysisId,
        letter: grade.letter,
        score: grade.score,
      },
    });

    await this.prisma.gradeHistory.create({
      data: {
        contractId,
        analysisId,
        letter: grade.letter,
        score: grade.score,
        gitRef: contract?.gitRef ?? null,
      },
    });

    await this.prisma.leaderboardEntry.upsert({
      where: { contractId },
      create: {
        contractId,
        ecosystem: contract?.ecosystem ?? null,
        letter: grade.letter,
        score: grade.score,
        detectorFindings: metrics.detectorFindings ?? 0,
        totalConflicts: metrics.totalConflicts ?? 0,
        parallelism: metrics.parallelism ?? null,
      },
      update: {
        ecosystem: contract?.ecosystem ?? null,
        letter: grade.letter,
        score: grade.score,
        detectorFindings: metrics.detectorFindings ?? 0,
        totalConflicts: metrics.totalConflicts ?? 0,
        parallelism: metrics.parallelism ?? null,
      },
    });
  }
}

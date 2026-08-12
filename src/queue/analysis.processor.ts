import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SlipstreamCoreService } from '../core/slipstream-core.service';
import { ANALYSIS_QUEUE, AnalysisJobData } from './queue.constants';

/**
 * BullMQ worker that consumes analysis jobs and invokes slipstream-core.
 *
 * Only instantiated when Redis is configured (the whole {@link QueueModule}
 * registers it conditionally), so `npm test` / `npm run test:e2e` never need a
 * running broker.
 *
 * TODO: persist the resulting reports via a repository once the analysis
 * persistence layer is finalized. For now the worker computes the report and
 * logs a summary; wiring it to PrismaService is a clean follow-up.
 */
@Processor(ANALYSIS_QUEUE)
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(private readonly core: SlipstreamCoreService) {
    super();
  }

  async process(job: Job<AnalysisJobData>): Promise<unknown> {
    const { kind } = job.data;
    this.logger.log(`Processing analysis job ${job.id} (${kind})`);

    switch (kind) {
      case 'SCAN': {
        const reports = await this.core.scan(job.data.path ?? '.');
        return { reports };
      }
      case 'PROFILE': {
        const report = await this.core.profile(job.data.fixture ?? '');
        return { report };
      }
      case 'DIFF': {
        const report = await this.core.diff(job.data.left ?? '', job.data.right ?? '');
        return { report };
      }
      default:
        throw new Error(`Unknown analysis kind: ${String(kind)}`);
    }
  }
}

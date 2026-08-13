import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalysisService } from '../modules/analysis/analysis.service';
import { ANALYSIS_QUEUE, AnalysisJobData } from './queue.constants';

/**
 * BullMQ worker that consumes analysis jobs and persists the results.
 *
 * Persistence goes through {@link AnalysisService.processJob}, the same
 * shared method the inline (no-broker) path uses, so both paths behave
 * identically. `processJob` is idempotent per job id, so retrying a job
 * (BullMQ's default backoff behaviour) never duplicates an Analysis or grade.
 *
 * Only instantiated when Redis is configured (the whole {@link QueueModule}
 * registers it conditionally), so `npm test` / `npm run test:e2e` never need a
 * running broker.
 */
@Processor(ANALYSIS_QUEUE)
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(private readonly analysis: AnalysisService) {
    super();
  }

  async process(job: Job<AnalysisJobData>): Promise<void> {
    this.logger.log(`Processing analysis job ${job.id} (${job.data.kind})`);
    await this.analysis.processJob(job.data);
  }
}

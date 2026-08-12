import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ANALYSIS_QUEUE, AnalysisJobData } from './queue.constants';
import { QueueService } from './queue.service';

/**
 * Real BullMQ-backed {@link QueueService}. Only registered when Redis is
 * configured (see {@link QueueModule}).
 */
@Injectable()
export class BullQueueService implements QueueService {
  readonly enabled = true;
  private readonly logger = new Logger(BullQueueService.name);

  constructor(@InjectQueue(ANALYSIS_QUEUE) private readonly analysisQueue: Queue) {}

  async enqueueAnalysis(data: AnalysisJobData): Promise<string | null> {
    const job = await this.analysisQueue.add('analyze', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    this.logger.log(`Enqueued analysis job ${job.id} (${data.kind})`);
    return job.id ?? null;
  }
}

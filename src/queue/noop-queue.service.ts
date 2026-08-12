import { Injectable, Logger } from '@nestjs/common';
import { QueueService } from './queue.service';

/**
 * No-op {@link QueueService} used when Redis is not configured (tests, local
 * dev without a broker). Records nothing and reports `enabled = false`.
 */
@Injectable()
export class NoopQueueService implements QueueService {
  readonly enabled = false;
  private readonly logger = new Logger(NoopQueueService.name);

  enqueueAnalysis(): Promise<string | null> {
    this.logger.debug('Queue disabled (no REDIS_HOST); analysis job not enqueued.');
    return Promise.resolve(null);
  }
}

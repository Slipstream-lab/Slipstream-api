import { AnalysisJobData } from './queue.constants';

/** Injection token for the queue service abstraction. */
export const QUEUE_SERVICE = Symbol('QUEUE_SERVICE');

/**
 * Abstraction over the analysis queue. Two implementations exist: a real
 * BullMQ-backed one and a no-op used when Redis is not configured (so the app
 * and tests run without a broker).
 */
export interface QueueService {
  /** Whether a real broker is wired up. */
  readonly enabled: boolean;
  /**
   * Enqueue an analysis job. Returns the broker job id, or null when the
   * queue is disabled (the caller should then process synchronously or leave
   * the job PENDING).
   */
  enqueueAnalysis(data: AnalysisJobData): Promise<string | null>;
}

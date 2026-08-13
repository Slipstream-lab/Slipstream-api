import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Logger, Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { BullQueueService } from './bull-queue.service';
import { NoopQueueService } from './noop-queue.service';
import { ANALYSIS_QUEUE } from './queue.constants';
import { QUEUE_SERVICE } from './queue.service';

/**
 * Queue module. Redis presence is decided at module-definition time from the
 * environment (BullMQ needs the connection to build its providers), so the
 * decision cannot be deferred to DI:
 *
 *  - When `REDIS_HOST` is set → registers BullMQ, the analysis queue, and the
 *    real {@link BullQueueService}. The {@link AnalysisProcessor} worker is
 *    registered by `AnalysisModule` (it needs `AnalysisService`), avoiding a
 *    circular module dependency.
 *  - When `REDIS_HOST` is empty/unset → registers ONLY the
 *    {@link NoopQueueService}, so the app and all test suites boot without a
 *    running Redis.
 *
 * Consumers always inject {@link QUEUE_SERVICE} and never depend on which
 * implementation is active.
 */
@Module({})
export class QueueModule {
  static register(): DynamicModule {
    const redisHost = (process.env.REDIS_HOST ?? '').trim();
    const enabled = redisHost.length > 0 && process.env.NODE_ENV !== 'test';

    if (!enabled) {
      new Logger(QueueModule.name).log('Redis not configured (or test env): using no-op queue.');
      return {
        module: QueueModule,
        providers: [{ provide: QUEUE_SERVICE, useClass: NoopQueueService }],
        exports: [QUEUE_SERVICE],
      };
    }

    const redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;

    return {
      module: QueueModule,
      imports: [
        CoreModule,
        BullModule.forRoot({
          connection: { host: redisHost, port: redisPort, password },
        }),
        BullModule.registerQueue({ name: ANALYSIS_QUEUE }),
      ],
      providers: [{ provide: QUEUE_SERVICE, useClass: BullQueueService }],
      exports: [QUEUE_SERVICE, BullModule],
    };
  }
}

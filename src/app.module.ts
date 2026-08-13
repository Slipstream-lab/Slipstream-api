import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigModule } from './config/config.module';
import { CoreModule } from './core/core.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { StellarModule } from './stellar/stellar.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    CoreModule,
    StellarModule,
    QueueModule.register(),
    HealthModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.get<boolean>('security.rateLimitEnabled') ?? true;
        return {
          throttlers: [
            {
              ttl: config.get<number>('security.rateLimitTtlMs', 60000),
              // When rate limiting is off (test env by default) the guard
              // stays registered but is effectively inert.
              limit: enabled
                ? config.get<number>('security.rateLimitLimit', 100)
                : Number.MAX_SAFE_INTEGER,
            },
          ],
        };
      },
    }),
    ContractsModule,
    AnalysisModule,
    LeaderboardModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

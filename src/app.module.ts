import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
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
    ContractsModule,
    AnalysisModule,
    LeaderboardModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}

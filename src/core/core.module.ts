import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CORE_RUNNER } from './core-runner.interface';
import { SlipstreamCoreService } from './slipstream-core.service';
import { SubprocessCoreRunner } from './subprocess-core-runner';

/**
 * Wires up the slipstream-core facade with the real subprocess runner. Tests
 * override the {@link CORE_RUNNER} provider with a MockCoreRunner.
 */
@Module({
  providers: [
    SlipstreamCoreService,
    {
      provide: CORE_RUNNER,
      useFactory: (config: ConfigService) => new SubprocessCoreRunner(config),
      inject: [ConfigService],
    },
  ],
  exports: [SlipstreamCoreService, CORE_RUNNER],
})
export class CoreModule {}

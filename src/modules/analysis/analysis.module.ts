import { Module } from '@nestjs/common';
import { CoreModule } from '../../core/core.module';
import { QueueModule } from '../../queue/queue.module';
import { AnalysisProcessor } from '../../queue/analysis.processor';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

@Module({
  imports: [CoreModule, QueueModule.register()],
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisProcessor],
  exports: [AnalysisService],
})
export class AnalysisModule {}

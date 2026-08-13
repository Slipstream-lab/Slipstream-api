import { Module } from '@nestjs/common';
import { IngestModule } from '../../ingest/ingest.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [IngestModule, AnalysisModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}

import { Module } from '@nestjs/common';
import { GitHubModule } from '../../github/github.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [GitHubModule, AnalysisModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}

import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GithubWebhookDto } from './dto/github-webhook.dto';
import { GithubSignatureGuard } from './github-signature.guard';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('github')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GithubSignatureGuard)
  @ApiOperation({
    summary: 'GitHub webhook receiver (HMAC-verified) for PR contention checks',
  })
  @ApiHeader({ name: 'x-github-event', required: true })
  @ApiHeader({ name: 'x-hub-signature-256', required: true })
  @ApiOkResponse({ description: 'Whether the event produced an analysis intent.' })
  handle(@Headers('x-github-event') event: string, @Body() payload: GithubWebhookDto) {
    return this.webhooks.handlePullRequest(event, payload);
  }
}

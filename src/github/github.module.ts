import { Module } from '@nestjs/common';
import { GITHUB_APP_CLIENT } from './github-app-client.interface';
import { MockGitHubAppClient } from './mock-github-app-client';

/**
 * Provides the GitHub App client abstraction used by the webhook → analysis →
 * check-run flow. The default provider is the hermetic mock; a real client
 * (JWT signing + installation tokens) replaces it in production wiring, with
 * credentials read from the `github` config namespace.
 */
@Module({
  providers: [{ provide: GITHUB_APP_CLIENT, useClass: MockGitHubAppClient }],
  exports: [GITHUB_APP_CLIENT],
})
export class GitHubModule {}

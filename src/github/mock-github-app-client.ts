import {
  CheckRun,
  CheckRunParams,
  GitHubAppClient,
  PrSources,
} from './github-app-client.interface';

/**
 * Deterministic in-memory {@link GitHubAppClient}. Never touches the network;
 * it returns canned installation tokens, placeholder source directories (the
 * core runner is mocked on the other side of the DI pair), and records
 * check-runs it creates. Swap this provider out for a real GitHub App client.
 */
export class MockGitHubAppClient implements GitHubAppClient {
  private seq = 0;

  async getInstallationToken(installationId: number | string): Promise<string> {
    return `mock-token-${installationId}`;
  }

  async fetchPrSources(): Promise<PrSources> {
    return { baseDir: '/mock/pr-base', headDir: '/mock/pr-head' };
  }

  async createCheckRun(params: CheckRunParams): Promise<CheckRun> {
    this.seq += 1;
    return { id: this.seq, url: `https://github.com/${params.repo}/check-runs/${this.seq}` };
  }

  async updateCheckRun(params: { repo: string; checkRunId: number }): Promise<CheckRun> {
    return {
      id: params.checkRunId,
      url: `https://github.com/${params.repo}/check-runs/${params.checkRunId}`,
    };
  }
}

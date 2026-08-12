import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { GithubWebhookDto } from '../../src/modules/webhooks/dto/github-webhook.dto';

describe('WebhooksService', () => {
  const service = new WebhooksService();

  const prPayload: GithubWebhookDto = {
    action: 'opened',
    pull_request: {
      number: 42,
      head: { ref: 'feature', sha: 'abc' },
      base: { ref: 'main', sha: 'def' },
    },
    repository: { full_name: 'slipstream-lab/demo' },
  };

  it('produces an analysis intent for an opened PR', () => {
    const result = service.handlePullRequest('pull_request', prPayload);
    expect(result.handled).toBe(true);
    expect(result.intent).toEqual({
      repo: 'slipstream-lab/demo',
      prNumber: 42,
      headRef: 'feature',
      baseRef: 'main',
    });
  });

  it('ignores non-pull_request events', () => {
    const result = service.handlePullRequest('push', prPayload);
    expect(result.handled).toBe(false);
    expect(result.reason).toContain('ignored event');
  });

  it('ignores non-analyzable actions', () => {
    const result = service.handlePullRequest('pull_request', {
      ...prPayload,
      action: 'labeled',
    });
    expect(result.handled).toBe(false);
    expect(result.reason).toContain('ignored action');
  });

  it('does not handle a payload missing pull_request/repository', () => {
    const result = service.handlePullRequest('pull_request', {
      action: 'opened',
    });
    expect(result.handled).toBe(false);
  });
});

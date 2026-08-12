import { Injectable, Logger } from '@nestjs/common';
import { GithubWebhookDto } from './dto/github-webhook.dto';

/** The outcome of mapping a webhook event to an analysis intent. */
export interface WebhookHandleResult {
  handled: boolean;
  reason: string;
  /** Details of the analysis intent produced, when handled. */
  intent?: {
    repo: string;
    prNumber: number;
    headRef?: string;
    baseRef?: string;
  };
}

/** GitHub PR actions that should trigger a contention check. */
const ANALYZABLE_ACTIONS = new Set(['opened', 'synchronize', 'reopened']);

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /**
   * Maps a validated GitHub `pull_request` webhook to an analysis intent.
   *
   * This is the interface-level mapping only: it decides *whether* and *what*
   * to analyze. Actually enqueuing the job requires resolving the PR's source
   * into a checked-out path (via a GitHub App installation token + clone/
   * archive fetch), which depends on real GitHub App authentication.
   *
   * TODO(github-app): authenticate as the GitHub App installation, fetch the
   * PR head, materialize the contract sources to a temp path, then create an
   * AnalysisJob (kind=DIFF base..head) and post a check-run with the grade
   * delta back to the PR. See docs / README "GitHub integration".
   */
  handlePullRequest(event: string, payload: GithubWebhookDto): WebhookHandleResult {
    if (event !== 'pull_request') {
      return { handled: false, reason: `ignored event: ${event}` };
    }
    if (!payload.action || !ANALYZABLE_ACTIONS.has(payload.action)) {
      return {
        handled: false,
        reason: `ignored action: ${payload.action ?? '(none)'}`,
      };
    }
    if (!payload.pull_request || !payload.repository) {
      return { handled: false, reason: 'missing pull_request or repository' };
    }

    const intent = {
      repo: payload.repository.full_name,
      prNumber: payload.pull_request.number,
      headRef: payload.pull_request.head?.ref,
      baseRef: payload.pull_request.base?.ref,
    };
    this.logger.log(`PR contention check queued (intent) for ${intent.repo}#${intent.prNumber}`);
    return { handled: true, reason: 'analysis intent created', intent };
  }
}

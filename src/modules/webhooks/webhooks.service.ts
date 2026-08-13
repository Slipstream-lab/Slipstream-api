import { Inject, Injectable, Logger } from '@nestjs/common';
import { DiffReport } from '../../core/core.types';
import { GITHUB_APP_CLIENT, GitHubAppClient } from '../../github/github-app-client.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalysisService } from '../analysis/analysis.service';
import { AnalysisKindDto } from '../analysis/dto/create-analysis.dto';
import { interpretDiff } from '../analysis/grade';
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
    /** The check-run posted for the contention check, when wired. */
    checkRun?: { id: number; url: string; conclusion: string };
  };
}

/** GitHub PR actions that should trigger a contention check. */
const ANALYZABLE_ACTIONS = new Set(['opened', 'synchronize', 'reopened']);

/** Name under which the contention check-run is posted. */
const CHECK_RUN_NAME = 'slipstream/contention-check';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GITHUB_APP_CLIENT) private readonly github: GitHubAppClient,
    private readonly analysis: AnalysisService,
  ) {}

  /**
   * Maps a validated GitHub `pull_request` webhook to an analysis intent and
   * drives the wired flow: materialize the PR base/head sources (via the
   * GitHub App client), run a base..head DIFF through the analysis pipeline,
   * and post a contention check-run with the verdict.
   *
   * The source fetching and check-run posting go through the
   * {@link GITHUB_APP_CLIENT} interface (mock by default). Real GitHub App
   * auth — JWT signed with `GITHUB_APP_PRIVATE_KEY`, exchanged for an
   * installation token, then clone/archive of the PR head — is implemented in
   * a real client behind the same interface. When a broker is available this
   * runs inline for the synchronous check-run; a queue-backed flow would post
   * the check-run's `completed` state from the worker instead.
   */
  async handlePullRequest(event: string, payload: GithubWebhookDto): Promise<WebhookHandleResult> {
    const filter = this.toIntent(event, payload);
    if (!filter.handled || !filter.intent) {
      return filter;
    }

    const { intent } = filter;
    const pr = payload.pull_request;
    const headSha = pr?.head?.sha;

    try {
      const contract = await this.upsertContract(intent.repo, intent.headRef);
      const sources = await this.github.fetchPrSources({
        repo: intent.repo,
        baseRef: intent.baseRef,
        headRef: intent.headRef,
      });

      const job = await this.analysis.create({
        contractId: contract.id,
        kind: AnalysisKindDto.DIFF,
        left: sources.baseDir,
        right: sources.headDir,
        runInline: true,
        ref: intent.headRef,
        commitSha: headSha,
      });
      this.logger.log(`PR contention check ${intent.repo}#${intent.prNumber}: DIFF job ${job.id}`);

      const report = await this.diffReport(contract.id);
      const { improved, findingsDelta } = interpretDiff(report);
      const conclusion = improved ? 'success' : 'neutral';
      const title = `Contention check for ${intent.repo}#${intent.prNumber}`;
      const summary = improved
        ? `No contention regressions: detector findings ${findingsDelta} vs base.`
        : `No improvement detected in contention (findings delta ${findingsDelta}).`;

      const checkRun = await this.github.createCheckRun({
        repo: intent.repo,
        name: CHECK_RUN_NAME,
        headSha: headSha ?? intent.headRef ?? 'HEAD',
        status: 'completed',
        conclusion,
        output: { title, summary },
      });

      this.logger.log(
        `Posted ${CHECK_RUN_NAME} ${conclusion} for ${intent.repo}#${intent.prNumber} (${checkRun.url})`,
      );
      return {
        handled: true,
        reason: 'analysis intent created; check-run posted',
        intent: { ...intent, checkRun: { id: checkRun.id, url: checkRun.url, conclusion } },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`PR contention check ${intent.repo}#${intent.prNumber} failed: ${message}`);
      return { handled: false, reason: `check-run flow failed: ${message}`, intent };
    }
  }

  /**
   * Pure filter: decide *whether* this event warrants a contention check and
   * capture the intent. Kept synchronous and side-effect free for tests.
   */
  private toIntent(event: string, payload: GithubWebhookDto): WebhookHandleResult {
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

    return {
      handled: true,
      reason: 'analysis intent created',
      intent: {
        repo: payload.repository.full_name,
        prNumber: payload.pull_request.number,
        headRef: payload.pull_request.head?.ref,
        baseRef: payload.pull_request.base?.ref,
      },
    };
  }

  /** Upsert a contract keyed on the PR's repository URL. */
  private async upsertContract(repo: string, headRef?: string) {
    const repoUrl = `https://github.com/${repo}.git`;
    const existing = await this.prisma.contract.findFirst({ where: { repoUrl } });
    if (existing) {
      return this.prisma.contract.update({
        where: { id: existing.id },
        data: { gitRef: headRef ?? null },
      });
    }
    return this.prisma.contract.create({
      data: { name: repo, repoUrl, gitRef: headRef ?? null },
    });
  }

  /** Fetch the freshest DIFF report for a contract (the one we just ran). */
  private async diffReport(contractId: string): Promise<DiffReport> {
    const [latest] = await this.analysis.findForContract(contractId);
    return (latest.rawReport ?? {
      summary: { detector_findings_delta: 0 },
    }) as unknown as DiffReport;
  }
}

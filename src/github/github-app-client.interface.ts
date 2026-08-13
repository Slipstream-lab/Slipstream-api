/** Injection token for the GitHub App client abstraction. */
export const GITHUB_APP_CLIENT = Symbol('GITHUB_APP_CLIENT');

/** GitHub check-run status values (API subset). */
export type CheckRunStatus = 'queued' | 'in_progress' | 'completed';

/** GitHub check-run conclusion values (API subset). */
export type CheckRunConclusion = 'success' | 'failure' | 'neutral' | 'action_required';

/** Payload to create or update a check-run. */
export interface CheckRunParams {
  /** Repository in `owner/name` form. */
  repo: string;
  /** Check name, e.g. `slipstream/contention-check`. */
  name: string;
  /** Commit sha the check runs against. */
  headSha: string;
  status?: CheckRunStatus;
  conclusion?: CheckRunConclusion;
  /** Check-run output annotations. */
  output?: { title: string; summary: string; text?: string };
}

/** The check-run created/updated on GitHub. */
export interface CheckRun {
  id: number;
  url: string;
}

/** Materialized PR source snapshots for a base..head DIFF. */
export interface PrSources {
  /** Local directory containing the PR base snapshot. */
  baseDir: string;
  /** Local directory containing the PR head snapshot. */
  headDir: string;
}

/**
 * Abstraction over the GitHub App API: installation-token auth, materializing
 * a PR's base/head sources locally, and posting check-runs.
 *
 * The default provider is a {@link MockGitHubAppClient}; a real client signs
 * a JWT with `github.appPrivateKey`, exchanges it for an installation token,
 * and clones/downloads the PR snapshots. Config is read from the `github`
 * namespace (appId/private key) — never from the repo.
 */
export interface GitHubAppClient {
  /** Resolve a short-lived installation access token. */
  getInstallationToken(installationId: number | string): Promise<string>;
  /** Fetch the PR base/head sources into local directories for a DIFF. */
  fetchPrSources(params: { repo: string; baseRef?: string; headRef?: string }): Promise<PrSources>;
  createCheckRun(params: CheckRunParams): Promise<CheckRun>;
  updateCheckRun(
    params: { repo: string; checkRunId: number } & Partial<Omit<CheckRunParams, 'repo'>>,
  ): Promise<CheckRun>;
}

import { FetchedRepository } from './fetched-repository.interface';

/** Injection token for the source fetcher abstraction. */
export const SOURCE_FETCHER = Symbol('SOURCE_FETCHER');

/**
 * Fetches a repository's sources so the analysis engine can run against them.
 *
 * The default implementation is a {@link MockSourceFetcher} (no network, no
 * disk). A production implementation would clone or download the repo (e.g.
 * `git clone --depth 1` or a tarball from the hosting provider) and return a
 * local directory.
 */
export interface SourceFetcher {
  fetchRepository(repoUrl: string, ref?: string): Promise<FetchedRepository>;
}

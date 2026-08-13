/**
 * The result of fetching a repository at a given ref.
 */
export interface FetchedRepository {
  /**
   * The resolved commit at the requested ref, when the fetcher can determine
   * it (git SHA for reproducibility).
   */
  commitSha?: string;
  /** Local directory containing the checked-out sources. */
  directory: string;
}

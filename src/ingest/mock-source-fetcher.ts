import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FetchedRepository } from './fetched-repository.interface';

/**
 * Deterministic in-memory {@link SourceFetcher} used by default and in tests.
 * It never touches the network or the filesystem; the returned directory is a
 * placeholder because the engine call is itself mocked (the core runner is
 * the other half of the DI pair). A real fetcher implementation swaps this
 * provider out.
 */
export class MockSourceFetcher {
  async fetchRepository(_repoUrl: string, ref = 'main'): Promise<FetchedRepository> {
    return {
      commitSha: `mock-${ref}`,
      directory: join(tmpdir(), 'slipstream-source-mock'),
    };
  }
}

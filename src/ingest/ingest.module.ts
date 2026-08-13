import { Module } from '@nestjs/common';
import { SOURCE_FETCHER } from './source-fetcher.interface';
import { MockSourceFetcher } from './mock-source-fetcher';

/**
 * Provides the source-fetching abstraction used by the ingest-from-repo flow.
 * The default provider is the hermetic mock; a real git/hosting-client
 * fetcher can replace it in production wiring.
 */
@Module({
  providers: [{ provide: SOURCE_FETCHER, useClass: MockSourceFetcher }],
  exports: [SOURCE_FETCHER],
})
export class IngestModule {}

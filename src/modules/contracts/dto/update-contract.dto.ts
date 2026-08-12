import { PartialType } from '@nestjs/swagger';
import { IngestContractDto } from './ingest-contract.dto';

/** Partial update of a contract's metadata. */
export class UpdateContractDto extends PartialType(IngestContractDto) {}

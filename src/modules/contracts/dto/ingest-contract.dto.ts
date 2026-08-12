import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

/** Payload for ingesting (registering) a contract. */
export class IngestContractDto {
  @ApiProperty({ description: 'Human-readable contract name/slug.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'On-chain Soroban contract id (starts with C).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^C[A-Z0-9]{55}$/, {
    message: 'contractId must be a valid Soroban contract id (C...).',
  })
  contractId?: string;

  @ApiPropertyOptional({ description: 'Source repository URL.' })
  @IsOptional()
  @IsUrl()
  repoUrl?: string;

  @ApiPropertyOptional({ description: 'Git ref (branch/tag/sha).' })
  @IsOptional()
  @IsString()
  gitRef?: string;

  @ApiPropertyOptional({ description: 'Ecosystem/protocol grouping.' })
  @IsOptional()
  @IsString()
  ecosystem?: string;

  @ApiPropertyOptional({ description: 'Free-form description.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

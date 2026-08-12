import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

/** Which slipstream-core command to run. Mirrors the Prisma AnalysisKind. */
export enum AnalysisKindDto {
  SCAN = 'SCAN',
  PROFILE = 'PROFILE',
  DIFF = 'DIFF',
}

/** Payload to enqueue an analysis job for a contract. */
export class CreateAnalysisDto {
  @ApiProperty({ description: 'The contract id (row id) to analyze.' })
  @IsString()
  contractId!: string;

  @ApiProperty({ enum: AnalysisKindDto, default: AnalysisKindDto.SCAN })
  @IsEnum(AnalysisKindDto)
  kind: AnalysisKindDto = AnalysisKindDto.SCAN;

  @ApiPropertyOptional({
    description: 'Path to scan (required for SCAN).',
  })
  @ValidateIf((o: CreateAnalysisDto) => o.kind === AnalysisKindDto.SCAN)
  @IsString()
  path?: string;

  @ApiPropertyOptional({
    description: 'Fixture path (required for PROFILE).',
  })
  @ValidateIf((o: CreateAnalysisDto) => o.kind === AnalysisKindDto.PROFILE)
  @IsString()
  fixture?: string;

  @ApiPropertyOptional({ description: 'Left operand path (required for DIFF).' })
  @ValidateIf((o: CreateAnalysisDto) => o.kind === AnalysisKindDto.DIFF)
  @IsString()
  left?: string;

  @ApiPropertyOptional({
    description: 'Right operand path (required for DIFF).',
  })
  @ValidateIf((o: CreateAnalysisDto) => o.kind === AnalysisKindDto.DIFF)
  @IsString()
  right?: string;

  @ApiPropertyOptional({
    description:
      'Run synchronously (invoke core inline) instead of enqueuing. Useful ' +
      'when no Redis worker is running.',
    default: false,
  })
  @IsOptional()
  runInline?: boolean;
}

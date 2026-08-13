import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AnalysisKindDto } from '../../analysis/dto/create-analysis.dto';

/** Payload for ingesting a contract from a repository URL + ref. */
export class IngestByRepoDto {
  @ApiProperty({ description: 'Git repository URL (https).' })
  @IsUrl()
  repoUrl!: string;

  @ApiPropertyOptional({
    description: 'Git ref to analyze (branch, tag or sha).',
    default: 'main',
  })
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional({
    description: 'Contract name. Defaults to the repository name derived from the URL.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Ecosystem/protocol grouping.' })
  @IsOptional()
  @IsString()
  ecosystem?: string;

  @ApiPropertyOptional({ description: 'Free-form description.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    enum: AnalysisKindDto,
    description: 'Which analysis to run against the fetched sources.',
    default: AnalysisKindDto.SCAN,
  })
  @IsOptional()
  @IsEnum(AnalysisKindDto)
  kind?: AnalysisKindDto;

  @ApiPropertyOptional({
    description: 'Run synchronously (invoke core inline) instead of enqueuing.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  runInline?: boolean;
}

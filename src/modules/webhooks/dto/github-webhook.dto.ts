import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

/** The minimal repository shape we consume from a GitHub webhook. */
export class GithubRepositoryDto {
  @ApiProperty()
  @IsString()
  full_name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clone_url?: string;
}

/** The minimal pull-request shape we consume. */
export class GithubPullRequestDto {
  @ApiProperty()
  @IsInt()
  number!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  head?: { ref?: string; sha?: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  base?: { ref?: string; sha?: string };
}

/**
 * A GitHub `pull_request` webhook payload (subset). We only validate the
 * fields we act on; unknown fields are ignored.
 */
export class GithubWebhookDto {
  @ApiPropertyOptional({
    description: 'The action, e.g. opened, synchronize, reopened.',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ type: GithubPullRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GithubPullRequestDto)
  pull_request?: GithubPullRequestDto;

  @ApiPropertyOptional({ type: GithubRepositoryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GithubRepositoryDto)
  repository?: GithubRepositoryDto;
}

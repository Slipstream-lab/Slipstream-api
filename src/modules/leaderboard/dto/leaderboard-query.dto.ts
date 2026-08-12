import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query parameters for the leaderboard listing. */
export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    description: 'Restrict ranking to a single ecosystem.',
  })
  @IsOptional()
  @IsString()
  ecosystem?: string;

  @ApiPropertyOptional({
    description: 'Maximum entries to return.',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  @ApiOperation({ summary: 'Ecosystem contention leaderboard (best first)' })
  @ApiOkResponse({ description: 'Ranked leaderboard entries.' })
  list(@Query() query: LeaderboardQueryDto) {
    return this.leaderboard.list(query);
  }

  @Post('recompute')
  @ApiOperation({ summary: 'Recompute leaderboard ranks' })
  @ApiOkResponse({ description: 'Number of entries ranked.' })
  async recompute(@Body('ecosystem') ecosystem?: string) {
    const ranked = await this.leaderboard.recomputeRanks(ecosystem);
    return { ranked };
  }
}

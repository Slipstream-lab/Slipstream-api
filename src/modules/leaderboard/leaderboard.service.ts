import { Injectable } from '@nestjs/common';
import { LeaderboardEntry } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return the leaderboard, ranked best-first (highest score = least
   * contentious). Optionally scoped to an ecosystem. Includes the contract
   * name for display.
   */
  async list(query: LeaderboardQueryDto): Promise<LeaderboardEntry[]> {
    return this.prisma.leaderboardEntry.findMany({
      where: query.ecosystem ? { ecosystem: query.ecosystem } : undefined,
      orderBy: [{ score: 'desc' }, { detectorFindings: 'asc' }],
      take: query.limit,
      include: { contract: { select: { name: true, contractId: true } } },
    });
  }

  /**
   * Recompute and persist dense ranks (1 = best) over the whole leaderboard or
   * within each ecosystem. Ranks are ordered by score desc, then fewer
   * findings. Returns the number of entries ranked.
   */
  async recomputeRanks(ecosystem?: string): Promise<number> {
    const entries = await this.prisma.leaderboardEntry.findMany({
      where: ecosystem ? { ecosystem } : undefined,
      orderBy: [{ score: 'desc' }, { detectorFindings: 'asc' }],
    });

    await this.prisma.$transaction(
      entries.map((entry, index) =>
        this.prisma.leaderboardEntry.update({
          where: { id: entry.id },
          data: { rank: index + 1 },
        }),
      ),
    );

    return entries.length;
  }
}

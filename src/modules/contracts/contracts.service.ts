import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Contract, GradeHistory } from '@prisma/client';
import { AnalysisJob } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SOURCE_FETCHER, SourceFetcher } from '../../ingest/source-fetcher.interface';
import { AnalysisService } from '../analysis/analysis.service';
import { AnalysisKindDto } from '../analysis/dto/create-analysis.dto';
import { IngestContractDto } from './dto/ingest-contract.dto';
import { IngestByRepoDto } from './dto/ingest-by-repo.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOURCE_FETCHER) private readonly fetcher: SourceFetcher,
    private readonly analysis: AnalysisService,
  ) {}

  /**
   * Ingest a contract from a repository URL + ref: fetch the sources (via the
   * {@link SOURCE_FETCHER} abstraction), register/update the contract keyed on
   * `repoUrl`, and enqueue (or run) an analysis against the fetched sources.
   * The ref and resolved commit are recorded on the analysis job for
   * reproducibility.
   */
  async ingestFromRepo(dto: IngestByRepoDto): Promise<{ contract: Contract; job: AnalysisJob }> {
    const ref = dto.ref ?? 'main';
    const fetched = await this.fetcher.fetchRepository(dto.repoUrl, ref);

    const existing = await this.prisma.contract.findFirst({
      where: { repoUrl: dto.repoUrl },
    });

    const contract = existing
      ? await this.prisma.contract.update({
          where: { id: existing.id },
          data: {
            gitRef: ref,
            ecosystem: dto.ecosystem,
            description: dto.description,
            name: dto.name ?? existing.name,
          },
        })
      : await this.prisma.contract.create({
          data: {
            name: dto.name ?? deriveRepoName(dto.repoUrl),
            repoUrl: dto.repoUrl,
            gitRef: ref,
            ecosystem: dto.ecosystem,
            description: dto.description,
          },
        });

    const job = await this.analysis.create({
      contractId: contract.id,
      kind: dto.kind ?? AnalysisKindDto.SCAN,
      path: fetched.directory,
      runInline: dto.runInline,
      ref,
      commitSha: fetched.commitSha,
    });

    this.logger.log(
      `Ingested repo ${dto.repoUrl}@${ref} as contract ${contract.id} ` +
        `(job ${job.id}${fetched.commitSha ? ` @ ${fetched.commitSha}` : ''})`,
    );
    return { contract, job };
  }

  /**
   * Ingest (register) a contract. Idempotent on `contractId`: if a contract
   * with the same on-chain id already exists, its metadata is updated.
   */
  async ingest(dto: IngestContractDto): Promise<Contract> {
    if (dto.contractId) {
      const existing = await this.prisma.contract.findUnique({
        where: { contractId: dto.contractId },
      });
      if (existing) {
        this.logger.log(`Updating existing contract ${existing.id}`);
        return this.prisma.contract.update({
          where: { id: existing.id },
          data: dto,
        });
      }
    }
    return this.prisma.contract.create({ data: dto });
  }

  async findAll(pagination: PaginationQueryDto): Promise<Contract[]> {
    return this.prisma.contract.findMany({
      skip: pagination.offset,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: { grades: true },
    });
    if (!contract) {
      throw new NotFoundException(`Contract ${id} not found`);
    }
    return contract;
  }

  async update(id: string, dto: UpdateContractDto): Promise<Contract> {
    await this.findOne(id);
    return this.prisma.contract.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.contract.delete({ where: { id } });
  }

  /** Returns the grade-over-time history for a contract, oldest first. */
  async gradeHistory(id: string): Promise<GradeHistory[]> {
    await this.findOne(id);
    return this.prisma.gradeHistory.findMany({
      where: { contractId: id },
      orderBy: { recordedAt: 'asc' },
    });
  }
}

/** Derives a display name from a repo URL, e.g. `org/name.git` → `name`. */
export function deriveRepoName(repoUrl: string): string {
  const trimmed = repoUrl.trim().replace(/\/+$/, '');
  const segment = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return segment.replace(/\.git$/i, '') || 'untitled';
}

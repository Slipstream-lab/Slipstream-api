import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Contract, GradeHistory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IngestContractDto } from './dto/ingest-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

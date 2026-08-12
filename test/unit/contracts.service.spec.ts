import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ContractsService } from '../../src/modules/contracts/contracts.service';

describe('ContractsService', () => {
  let service: ContractsService;
  let prisma: {
    contract: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    gradeHistory: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      contract: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      gradeHistory: { findMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ContractsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ContractsService);
  });

  describe('ingest', () => {
    it('creates a new contract when no contractId collision', async () => {
      prisma.contract.create.mockResolvedValue({ id: 'c1', name: 'Foo' });
      const result = await service.ingest({ name: 'Foo' });
      expect(prisma.contract.create).toHaveBeenCalledWith({
        data: { name: 'Foo' },
      });
      expect(result).toEqual({ id: 'c1', name: 'Foo' });
    });

    it('updates existing contract when contractId already exists (idempotent)', async () => {
      prisma.contract.findUnique.mockResolvedValue({ id: 'c1', name: 'Old' });
      prisma.contract.update.mockResolvedValue({ id: 'c1', name: 'New' });
      const dto = {
        name: 'New',
        contractId: 'C' + 'A'.repeat(55),
      };
      const result = await service.ingest(dto);
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: dto,
      });
      expect(result.name).toBe('New');
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the contract when found', async () => {
      prisma.contract.findUnique.mockResolvedValue({ id: 'c1' });
      await expect(service.findOne('c1')).resolves.toEqual({ id: 'c1' });
    });

    it('throws NotFoundException when missing', async () => {
      prisma.contract.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('gradeHistory', () => {
    it('returns history ordered oldest first', async () => {
      prisma.contract.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.gradeHistory.findMany.mockResolvedValue([{ score: 80 }]);
      const history = await service.gradeHistory('c1');
      expect(prisma.gradeHistory.findMany).toHaveBeenCalledWith({
        where: { contractId: 'c1' },
        orderBy: { recordedAt: 'asc' },
      });
      expect(history).toEqual([{ score: 80 }]);
    });
  });
});

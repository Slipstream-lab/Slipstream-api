import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SOURCE_FETCHER } from '../../src/ingest/source-fetcher.interface';
import { AnalysisService } from '../../src/modules/analysis/analysis.service';
import { ContractsService, deriveRepoName } from '../../src/modules/contracts/contracts.service';

describe('ContractsService', () => {
  let service: ContractsService;
  let prisma: {
    contract: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    gradeHistory: { findMany: jest.Mock };
  };
  let analysis: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      contract: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      gradeHistory: { findMany: jest.fn() },
    };
    analysis = { create: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SOURCE_FETCHER,
          useValue: {
            fetchRepository: jest
              .fn()
              .mockResolvedValue({ commitSha: 'mock-abc', directory: '/tmp/repo' }),
          },
        },
        { provide: AnalysisService, useValue: analysis },
      ],
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

  describe('ingestFromRepo', () => {
    const repoUrl = 'https://github.com/org/soroban-counter.git';
    const dto = { repoUrl, ref: 'main' };

    it('creates a contract and enqueues analysis against fetched sources', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);
      prisma.contract.create.mockResolvedValue({ id: 'c1', name: 'soroban-counter' });
      analysis.create.mockResolvedValue({ id: 'job1', status: 'PENDING' });

      const result = await service.ingestFromRepo(dto);

      expect(prisma.contract.create).toHaveBeenCalledWith({
        data: {
          name: 'soroban-counter',
          repoUrl,
          gitRef: 'main',
          ecosystem: undefined,
          description: undefined,
        },
      });
      expect(analysis.create).toHaveBeenCalledWith({
        contractId: 'c1',
        kind: 'SCAN',
        path: '/tmp/repo',
        runInline: undefined,
        ref: 'main',
        commitSha: 'mock-abc',
      });
      expect(result).toEqual({
        contract: { id: 'c1', name: 'soroban-counter' },
        job: { id: 'job1', status: 'PENDING' },
      });
    });

    it('updates an existing contract keyed on repoUrl (idempotent) and re-runs', async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: 'c9', name: 'Old' });
      prisma.contract.update.mockResolvedValue({ id: 'c9', name: 'Renamed' });
      analysis.create.mockResolvedValue({ id: 'job2' });

      const result = await service.ingestFromRepo({ ...dto, name: 'Renamed' });

      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'c9' },
        data: {
          gitRef: 'main',
          ecosystem: undefined,
          description: undefined,
          name: 'Renamed',
        },
      });
      expect(result.contract.name).toBe('Renamed');
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('defaults the ref to main when omitted', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);
      prisma.contract.create.mockResolvedValue({ id: 'c1' });
      analysis.create.mockResolvedValue({ id: 'job1' });

      await service.ingestFromRepo({ repoUrl });

      expect(prisma.contract.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ gitRef: 'main' }) }),
      );
      expect(analysis.create).toHaveBeenCalledWith(expect.objectContaining({ ref: 'main' }));
    });
  });
});

describe('deriveRepoName', () => {
  it.each([
    ['https://github.com/org/soroban-counter.git', 'soroban-counter'],
    ['https://github.com/org/soroban-counter', 'soroban-counter'],
    ['https://github.com/org/repo/', 'repo'],
    ['ssh://git@github.com/org/other.git', 'other'],
  ])('derives %s -> %s', (url, expected) => {
    expect(deriveRepoName(url)).toBe(expected);
  });
});

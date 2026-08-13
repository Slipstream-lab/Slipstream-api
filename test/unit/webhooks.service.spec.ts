import { Test } from '@nestjs/testing';
import { GITHUB_APP_CLIENT } from '../../src/github/github-app-client.interface';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AnalysisService } from '../../src/modules/analysis/analysis.service';
import { GithubWebhookDto } from '../../src/modules/webhooks/dto/github-webhook.dto';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: {
    contract: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let github: {
    fetchPrSources: jest.Mock;
    createCheckRun: jest.Mock;
  };
  let analysis: {
    create: jest.Mock;
    findForContract: jest.Mock;
  };

  const prPayload: GithubWebhookDto = {
    action: 'opened',
    pull_request: {
      number: 42,
      head: { ref: 'feature', sha: 'abc123' },
      base: { ref: 'main', sha: 'def456' },
    },
    repository: { full_name: 'slipstream-lab/demo' },
  };

  const diffReport = {
    left: {},
    right: {},
    per_function_deltas: [],
    summary: {
      detector_findings_delta: -2,
      storage_reads_delta: 0,
      storage_writes_delta: -1,
    },
  };

  beforeEach(async () => {
    prisma = {
      contract: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'c1', name: 'slipstream-lab/demo' }),
        update: jest.fn(),
      },
    };
    github = {
      fetchPrSources: jest.fn().mockResolvedValue({ baseDir: '/p/base', headDir: '/p/head' }),
      createCheckRun: jest
        .fn()
        .mockResolvedValue({ id: 7, url: 'https://github.com/x/check-runs/7' }),
    };
    analysis = {
      create: jest.fn().mockResolvedValue({ id: 'job1' }),
      findForContract: jest.fn().mockResolvedValue([{ rawReport: diffReport }]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: GITHUB_APP_CLIENT, useValue: github },
        { provide: AnalysisService, useValue: analysis },
      ],
    }).compile();

    service = moduleRef.get(WebhooksService);
  });

  it('produces an analysis intent for an opened PR', async () => {
    const result = await service.handlePullRequest('pull_request', prPayload);
    expect(result.handled).toBe(true);
    expect(result.intent).toMatchObject({
      repo: 'slipstream-lab/demo',
      prNumber: 42,
      headRef: 'feature',
      baseRef: 'main',
    });
  });

  it('upserts a contract, runs a base..head DIFF and posts a check-run', async () => {
    const result = await service.handlePullRequest('pull_request', prPayload);

    expect(prisma.contract.create).toHaveBeenCalledWith({
      data: {
        name: 'slipstream-lab/demo',
        repoUrl: 'https://github.com/slipstream-lab/demo.git',
        gitRef: 'feature',
      },
    });

    expect(analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 'c1',
        kind: 'DIFF',
        left: '/p/base',
        right: '/p/head',
        runInline: true,
        ref: 'feature',
        commitSha: 'abc123',
      }),
    );

    // detector_findings_delta = -2 => improved => success
    expect(github.createCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'slipstream-lab/demo',
        name: 'slipstream/contention-check',
        headSha: 'abc123',
        status: 'completed',
        conclusion: 'success',
      }),
    );
    expect(result.intent?.checkRun).toEqual({
      id: 7,
      url: 'https://github.com/x/check-runs/7',
      conclusion: 'success',
    });
  });

  it('marks the check-run neutral when the diff is not an improvement', async () => {
    analysis.findForContract.mockResolvedValue([
      {
        rawReport: {
          ...diffReport,
          summary: { ...diffReport.summary, detector_findings_delta: 3 },
        },
      },
    ]);
    await service.handlePullRequest('pull_request', prPayload);
    expect(github.createCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ conclusion: 'neutral' }),
    );
  });

  it('reports failure gracefully when the flow throws', async () => {
    analysis.create.mockRejectedValue(new Error('boom'));
    const result = await service.handlePullRequest('pull_request', prPayload);
    expect(result.handled).toBe(false);
    expect(result.reason).toContain('boom');
    expect(github.createCheckRun).not.toHaveBeenCalled();
  });

  it('ignores non-pull_request events', async () => {
    const result = await service.handlePullRequest('push', prPayload);
    expect(result.handled).toBe(false);
    expect(result.reason).toContain('ignored event');
  });

  it('ignores non-analyzable actions', async () => {
    const result = await service.handlePullRequest('pull_request', {
      ...prPayload,
      action: 'labeled',
    });
    expect(result.handled).toBe(false);
    expect(result.reason).toContain('ignored action');
  });

  it('does not handle a payload missing pull_request/repository', async () => {
    const result = await service.handlePullRequest('pull_request', {
      action: 'opened',
    });
    expect(result.handled).toBe(false);
  });
});

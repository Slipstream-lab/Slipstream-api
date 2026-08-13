import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { json } from 'express';
import type { Request } from 'express';
import helmet from 'helmet';
import { AppModule } from '../../src/app.module';
import { CORE_RUNNER } from '../../src/core/core-runner.interface';
import { MockCoreRunner } from '../../src/core/mock-core-runner';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { REQUEST_ID_HEADER } from '../../src/common/interceptors/logging.interceptor';

const WEBHOOK_SECRET = 'e2e-secret';

/**
 * Minimal in-memory Prisma stand-in so the app boots and controller endpoints
 * work without a real database. Only the methods the exercised endpoints touch
 * are implemented.
 */
function inMemoryPrisma() {
  const contracts = new Map<string, any>();
  let seq = 0;
  return {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    contract: {
      create: jest.fn(({ data }: any) => {
        const id = `c${++seq}`;
        const row = { id, createdAt: new Date(), ...data };
        contracts.set(id, row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(contracts.get(where.id) ?? null)),
      findMany: jest.fn(() => Promise.resolve(Array.from(contracts.values()))),
    },
    leaderboardEntry: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
  };
}

describe('Slipstream API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.REDIS_HOST = '';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Never spawn the real binary in e2e.
      .overrideProvider(CORE_RUNNER)
      .useValue(new MockCoreRunner())
      // Never touch a real database.
      .overrideProvider(PrismaService)
      .useValue(inMemoryPrisma())
      .compile();

    app = moduleRef.createNestApplication();
    app.use(helmet());
    app.use(
      json({
        verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
          req.rawBody = Buffer.from(buf);
        },
      }),
    );
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('slipstream-api');
    });
  });

  describe('security hardening', () => {
    it('sets baseline security headers (helmet)', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('propagates a generated request id on every response', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      const requestId = res.headers[REQUEST_ID_HEADER];
      expect(typeof requestId).toBe('string');
      expect(requestId.length).toBeGreaterThan(0);
    });

    it('honors an inbound x-request-id', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set(REQUEST_ID_HEADER, 'trace-abc')
        .expect(200);
      expect(res.headers[REQUEST_ID_HEADER]).toBe('trace-abc');
    });
  });

  describe('contracts', () => {
    it('ingests a contract and lists it', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/contracts')
        .send({ name: 'Demo', ecosystem: 'defi' })
        .expect(201);
      expect(create.body.id).toBeDefined();
      expect(create.body.name).toBe('Demo');

      const list = await request(app.getHttpServer()).get('/api/contracts').expect(200);
      expect(Array.isArray(list.body)).toBe(true);
      expect(list.body.length).toBeGreaterThan(0);
    });

    it('rejects an invalid contractId (validation pipe)', async () => {
      await request(app.getHttpServer())
        .post('/api/contracts')
        .send({ name: 'Bad', contractId: 'not-a-valid-id' })
        .expect(400);
    });
  });

  describe('leaderboard', () => {
    it('returns an (empty) leaderboard', async () => {
      const res = await request(app.getHttpServer()).get('/api/leaderboard').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('webhooks', () => {
    it('rejects a webhook with a bad signature', async () => {
      await request(app.getHttpServer())
        .post('/api/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-hub-signature-256', 'sha256=deadbeef')
        .send({ action: 'opened' })
        .expect(401);
    });

    it('accepts a webhook with a valid signature and returns an intent', async () => {
      const payload = {
        action: 'opened',
        pull_request: { number: 7, head: { ref: 'f' }, base: { ref: 'main' } },
        repository: { full_name: 'lab/demo' },
      };
      const body = JSON.stringify(payload);
      const signature = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-hub-signature-256', signature)
        .set('content-type', 'application/json')
        .send(body)
        .expect(200);
      expect(res.body.handled).toBe(true);
      expect(res.body.intent.prNumber).toBe(7);
    });
  });

  describe('rate limiting (enabled)', () => {
    let throttledApp: INestApplication;

    beforeAll(async () => {
      process.env.RATE_LIMIT_ENABLED = 'true';
      process.env.RATE_LIMIT_LIMIT = '2';

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(CORE_RUNNER)
        .useValue(new MockCoreRunner())
        .overrideProvider(PrismaService)
        .useValue(inMemoryPrisma())
        .compile();

      throttledApp = moduleRef.createNestApplication();
      throttledApp.use(
        json({
          verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
            req.rawBody = Buffer.from(buf);
          },
        }),
      );
      throttledApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      throttledApp.useGlobalFilters(new HttpExceptionFilter());
      throttledApp.setGlobalPrefix('api', { exclude: ['health'] });
      await throttledApp.init();
    });

    afterAll(async () => {
      delete process.env.RATE_LIMIT_ENABLED;
      delete process.env.RATE_LIMIT_LIMIT;
      await throttledApp?.close();
    });

    it('returns 429 after the configured limit is exceeded', async () => {
      const server = throttledApp.getHttpServer();
      await request(server).get('/health').expect(200);
      await request(server).get('/health').expect(200);
      await request(server).get('/health').expect(429);
    });
  });
});

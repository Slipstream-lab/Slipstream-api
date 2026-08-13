import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument, configureApp } from '../src/app.setup';
import { CORE_RUNNER } from '../src/core/core-runner.interface';
import { MockCoreRunner } from '../src/core/mock-core-runner';
import { PrismaService } from '../src/prisma/prisma.service';

const logger = new Logger('generate-openapi');

/**
 * Minimal Prisma stand-in. Doc generation never executes a query — it only
 * needs the provider to exist so the DI graph resolves without touching a
 * real database.
 */
function inertPrisma(): Pick<PrismaService, '$connect' | '$disconnect'> {
  return {
    $connect: () => Promise.resolve(),
    $disconnect: () => Promise.resolve(),
  };
}

/**
 * Boots the app in doc-only mode (no real worker, no database, no network)
 * and writes the OpenAPI document to `openapi.json` at the repository root.
 */
async function main(): Promise<void> {
  // Doc generation must be deterministic: never wire the real queue.
  process.env.REDIS_HOST = '';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(CORE_RUNNER)
    .useValue(new MockCoreRunner())
    .overrideProvider(PrismaService)
    .useValue(inertPrisma())
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const document = buildOpenApiDocument(app);
  const outPath = join(process.cwd(), 'openapi.json');
  await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`);

  logger.log(`Wrote ${outPath}`);
  await app.close();
}

main().catch((error: unknown) => {
  logger.error(
    `Failed to generate openapi.json: ${error instanceof Error ? error.message : String(error)}`,
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import type { Request } from 'express';

/**
 * Shared application bootstrap that must stay identical between the real
 * server (`main.ts`) and the doc-only boot used to export `openapi.json`
 * (`scripts/generate-openapi.ts`). Keeping the setup here guarantees the
 * exported document describes the exact same surface the running API serves.
 */
export function configureApp(app: INestApplication): void {
  // Capture the raw request body so the GitHub signature guard can verify the
  // HMAC over the exact bytes GitHub signed.
  app.use(
    json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = app.get(ConfigService);
  const corsOrigins = config.get<string[]>('app.corsOrigins', []);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });
}

/** Builds the OpenAPI document for the running (or doc-only) application. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Slipstream API')
    .setDescription(
      'Backend + analysis-orchestration layer for Slipstream: contract ' +
        'ingestion, contention analysis via slipstream-core, leaderboard, ' +
        'and GitHub PR contention checks.',
    )
    .setVersion('0.1.0')
    .addTag('health')
    .addTag('contracts')
    .addTag('analysis')
    .addTag('leaderboard')
    .addTag('webhooks')
    .build();
  return SwaggerModule.createDocument(app, swaggerConfig);
}

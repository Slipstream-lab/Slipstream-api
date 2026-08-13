import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  configureApp(app);

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('app.port', 3000);
  await app.listen(port);
  logger.log(`Slipstream API listening on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();

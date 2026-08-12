import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configNamespaces } from './configuration';
import { validationSchema } from './env.validation';

/**
 * Global configuration module. Loads `.env`, validates every variable against
 * a Joi schema at boot, and exposes typed namespaces. Because everything has a
 * sensible default, the app boots in tests without any external services.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configNamespaces,
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      // In test runs we do not want a stray developer `.env` to leak in.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
  ],
})
export class ConfigModule {}

import { registerAs } from '@nestjs/config';

/**
 * Strongly-typed configuration namespaces. Values are read from validated
 * environment variables (see env.validation.ts). Access via
 * `configService.get('app.port')` etc.
 */

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? '',
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? '',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  /** The worker/queue is only wired up when a host is configured. */
  enabled: Boolean((process.env.REDIS_HOST ?? '').trim()),
}));

export const coreConfig = registerAs('core', () => ({
  bin: process.env.SLIPSTREAM_BIN ?? 'slipstream',
  timeoutMs: parseInt(process.env.SLIPSTREAM_TIMEOUT_MS ?? '60000', 10),
}));

export const githubConfig = registerAs('github', () => ({
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
  appId: process.env.GITHUB_APP_ID || undefined,
  appPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY || undefined,
}));

export const stellarConfig = registerAs('stellar', () => ({
  rpcUrl: process.env.STELLAR_RPC_URL ?? '',
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE ?? '',
  horizonUrl: process.env.HORIZON_URL ?? '',
}));

export const configNamespaces = [
  appConfig,
  databaseConfig,
  redisConfig,
  coreConfig,
  githubConfig,
  stellarConfig,
];

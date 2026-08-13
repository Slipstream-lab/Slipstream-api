import * as Joi from 'joi';

/**
 * Joi schema validating all environment variables at boot. Every variable is
 * optional-with-a-default where possible so the application (and its test
 * suites) can boot without any external services present.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  CORS_ORIGINS: Joi.string().allow('').default('http://localhost:3001'),

  // Database — a placeholder default keeps Prisma/config happy in tests where
  // no DB is reachable; nothing actually connects unless a query runs.
  DATABASE_URL: Joi.string().default(
    'postgresql://slipstream:slipstream_local_dev@localhost:5432/slipstream?schema=public',
  ),

  // Redis / queue — REDIS_HOST may be empty to disable the worker entirely.
  REDIS_HOST: Joi.string().allow('').default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // slipstream-core engine.
  SLIPSTREAM_BIN: Joi.string().default('slipstream'),
  SLIPSTREAM_TIMEOUT_MS: Joi.number().integer().min(1000).default(60000),

  // GitHub webhooks.
  GITHUB_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  GITHUB_APP_ID: Joi.string().allow('').optional(),
  GITHUB_APP_PRIVATE_KEY: Joi.string().allow('').optional(),

  // Security hardening. Rate limiting defaults ON outside the test env and can
  // be forced on/off explicitly (e.g. RATE_LIMIT_ENABLED=true in e2e).
  RATE_LIMIT_ENABLED: Joi.boolean().truthy('true', '1').falsy('false', '0').optional(),
  RATE_LIMIT_TTL_MS: Joi.number().integer().min(1).default(60000),
  RATE_LIMIT_LIMIT: Joi.number().integer().min(1).default(100),

  // Stellar (interfaces + mocks only).
  STELLAR_RPC_URL: Joi.string().uri().default('https://soroban-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: Joi.string().default('Test SDF Network ; September 2015'),
  HORIZON_URL: Joi.string().uri().default('https://horizon-testnet.stellar.org'),
});

# Slipstream API

The backend and analysis-orchestration layer for **Slipstream** — a toolkit
that measures how efficiently Soroban smart contracts parallelize under
Stellar's phased (CAP-0063) execution model.

This service ingests Soroban contracts, runs contention analysis by invoking
the Rust engine [`slipstream-core`](../Slipstream-core) (the `slipstream`
CLI), stores results in PostgreSQL via Prisma, exposes an ecosystem
contention **leaderboard**, and handles **GitHub PR contention checks** via
webhooks. The Next.js frontend
[`slipstream-web`](../Slipstream-web) consumes this API.

> Status: **foundation**. The HTTP surface, persistence model, core adapter,
> queue scaffolding, and Stellar/GitHub interfaces are implemented and tested.
> Several integrations (live Stellar RPC, GitHub App auth, worker persistence)
> are intentionally left as clearly-scoped `TODO`s with clean interfaces — see
> [Roadmap / TODOs](#roadmap--todos).

## Tech stack

- **NestJS 11** + TypeScript (strict)
- **Prisma 6** + PostgreSQL
- **BullMQ** (Redis) for the analysis job queue
- **Swagger / OpenAPI** at `/docs`
- **Jest** (unit) + **supertest** (e2e)

## Architecture

```
             ┌──────────────┐        HTTP/REST + Swagger
 slipstream- │   Frontend   │◀──────────────────────────────┐
    web      │  (Next.js)   │                                │
             └──────────────┘                                │
                                                    ┌─────────────────────┐
 GitHub  ──webhook (HMAC)──────────────────────────▶│                     │
                                                    │   slipstream-api    │
                                                    │      (NestJS)       │
                                                    │                     │
   ┌───────────────── modules ─────────────────┐   │  ┌───────────────┐  │
   │ contracts · analysis · leaderboard ·        │  │  │ ConfigModule  │  │
   │ webhooks                                    │──┼─▶│ PrismaModule  │  │
   └─────────────────────────────────────────────┘  │  │ QueueModule   │  │
                       │                             │  │ CoreModule    │  │
                       │ enqueue                     │  │ StellarModule │  │
                       ▼                             │  └───────────────┘  │
                 ┌───────────┐   BullMQ   ┌──────────┴──────────┐          │
                 │  Redis    │◀──────────▶│  AnalysisProcessor  │          │
                 └───────────┘            └──────────┬──────────┘          │
                                                     │ spawn                │
                                          ┌──────────▼──────────┐          │
                                          │  slipstream-core    │          │
                                          │  (Rust CLI binary)  │          │
                                          └─────────────────────┘          │
                       ┌─────────────────────────────────────────┐        │
                       │              PostgreSQL (Prisma)          │◀───────┘
                       └─────────────────────────────────────────┘
```

### Module map

| Path                     | Responsibility                                                             |
| ------------------------ | -------------------------------------------------------------------------- |
| `src/config`             | `@nestjs/config` + Joi env validation. Every var has a safe default.       |
| `src/prisma`             | `PrismaModule` + `PrismaService` (connection lifecycle, non-fatal boot).   |
| `src/common`             | Global exception filter, request-logging interceptor, shared DTOs.         |
| `src/core`               | `SlipstreamCoreService` + `CoreRunner` (subprocess + mock) — the engine adapter. |
| `src/stellar`            | `StellarRpcClient` / `StellarHorizonClient` / `XdrDecoder` interfaces + mocks. |
| `src/queue`              | BullMQ queue + `AnalysisProcessor` worker, guarded so it no-ops without Redis. |
| `src/health`             | `GET /health` liveness endpoint.                                           |
| `src/modules/contracts`  | Ingest contracts, get metadata, grade history.                             |
| `src/modules/analysis`   | Enqueue/run analysis jobs, fetch results, grade computation.               |
| `src/modules/leaderboard`| Ecosystem contention ranking.                                              |
| `src/modules/webhooks`   | GitHub webhook receiver with HMAC signature guard.                         |

## How slipstream-core is invoked

The engine is a sibling Rust binary (`slipstream`). It is never assumed to
exist at runtime in tests. Invocation is abstracted behind a `CoreRunner`
interface (`src/core/core-runner.interface.ts`):

- **`SubprocessCoreRunner`** spawns the binary named by `SLIPSTREAM_BIN`
  (default `slipstream`), captures stdout/stderr, and enforces a timeout. A
  missing binary (`ENOENT`) surfaces as a non-zero exit code, not a crash.
- **`MockCoreRunner`** returns canned engine output for tests and for booting
  without the binary.

`SlipstreamCoreService` runs the commands and **normalizes** the output:

| Command                             | Method                       | Returns          |
| ----------------------------------- | ---------------------------- | ---------------- |
| `slipstream scan <path> --json`     | `scan(path)`                 | `AnalysisReport[]` |
| `slipstream profile --fixture <f>`  | `profile(fixture)`           | `ProfileReport`  |
| `slipstream diff <l> <r> --json`    | `diff(left, right)`          | `DiffReport`     |

> **Contract-fidelity note.** The task's modeled contract uses
> `AnalysisReport.source` and `storage_reads: string[]`. The *current* Rust
> engine actually serializes `scan --json` with `source_name` and
> `storage_reads`/`storage_writes` as `StaticKey` objects (`{ segments }`).
> The adapter accepts the raw engine shape and normalizes it to the documented
> contract (`source`, dotted-string keys), so the rest of the API only sees the
> clean types. Likewise, `profile` currently emits a **human-readable summary**
> (no `--json` flag yet); the adapter parses that text into `ProfileReport`.
> Both normalizations are unit-tested against sample fixtures and are marked
> with `TODO(core)` to switch to JSON once the engine exposes it. See
> `src/core/core.types.ts`.

## Grading

`src/modules/analysis/grade.ts` turns engine output into a letter grade
(A–F) plus a 0–100 numeric score:

- **`gradeFromScan`** starts at 100 and deducts weighted penalties per detector
  finding (`global-static-write` is the heaviest) and for write amplification.
- **`gradeFromProfile`** rewards high parallelism relative to transaction count
  and penalizes conflicts.

Grades are stored on the `Grade` row, appended to `GradeHistory` (for
grade-over-time charts), and denormalized into `LeaderboardEntry`.

## Getting started (local)

### Prerequisites

- Node.js ≥ 20
- Docker (for local Postgres + Redis)
- Optionally, the `slipstream` binary on PATH (build from `../Slipstream-core`
  with `cargo build --release`; the binary lands in `target/release/`). Without
  it, analysis endpoints run against the mock in tests, and the subprocess
  runner reports a clean error at runtime.

### 1. Install and configure

```sh
npm install
cp .env.example .env   # tweak if needed; defaults match docker-compose
```

### 2. Start datastores

```sh
docker compose up -d   # postgres on :5432, redis on :6379
```

### 3. Generate the Prisma client and run migrations

```sh
npm run prisma:generate
npm run prisma:migrate   # requires a running Postgres (creates the schema)
```

### 4. Run the API

```sh
npm run start:dev
# API on http://localhost:3000, Swagger on http://localhost:3000/docs
```

## Database migrations

Migrations live in `prisma/migrations` and are committed to the repo. The
initial migration (`..._init`) was generated from `prisma/schema.prisma` and
applies cleanly to an empty database.

- **Local development** — `npm run prisma:migrate` runs `prisma migrate dev`:
  it applies any pending migrations, then detects drift between the database
  and `schema.prisma`, prompting for a new migration name when needed.
- **Adding a schema change** — edit `prisma/schema.prisma`, then create a
  migration with a descriptive name:
  ```sh
  npm run prisma:migrate -- --name describe_the_change
  ```
  Review the generated SQL and commit it together with the schema change.
- **Deploy / CI** — `npx prisma migrate deploy` applies only *committed*
  migrations in order. It never creates new migrations or inspects your local
  schema, so it is safe to run against production. CI runs it against a fresh
  Postgres service container to prove the migrations apply cleanly.
- **No credentials in migrations.** Migrations contain only schema SQL; the
  connection string is supplied via `DATABASE_URL` at runtime.

## Environment variables

All variables are validated at boot (`src/config/env.validation.ts`) and have
safe defaults so the app boots without external services.

| Variable                     | Default                                    | Purpose                                             |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------- |
| `PORT`                       | `3000`                                     | HTTP port.                                          |
| `NODE_ENV`                   | `development`                              | Environment.                                        |
| `CORS_ORIGINS`               | `http://localhost:3001`                    | Comma-separated allowed origins (the web app).      |
| `DATABASE_URL`               | local dev Postgres URL                     | Prisma datasource.                                  |
| `REDIS_HOST`                 | `localhost`                                | Redis host. **Empty ⇒ queue worker disabled.**      |
| `REDIS_PORT`                 | `6379`                                     | Redis port.                                         |
| `REDIS_PASSWORD`             | _(unset)_                                  | Redis auth.                                         |
| `SLIPSTREAM_BIN`             | `slipstream`                               | Path/name of the core CLI binary.                   |
| `SLIPSTREAM_TIMEOUT_MS`      | `60000`                                    | Per-invocation timeout.                             |
| `GITHUB_WEBHOOK_SECRET`      | _(empty)_                                  | HMAC secret for webhook verification.               |
| `STELLAR_RPC_URL`            | testnet RPC                                | Soroban RPC endpoint (interfaces/mocks only).       |
| `STELLAR_NETWORK_PASSPHRASE` | testnet passphrase                         | Network passphrase.                                 |
| `HORIZON_URL`                | testnet Horizon                            | Horizon endpoint (interfaces/mocks only).           |

**Never commit a real `.env`.** It is gitignored; only `.env.example`
(placeholders) is tracked.

## API surface (selected)

All routes except `/health` are under the `/api` prefix. See `/docs` for the
full, live OpenAPI spec.

| Method | Path                              | Description                                  |
| ------ | --------------------------------- | -------------------------------------------- |
| GET    | `/health`                         | Liveness probe.                              |
| POST   | `/api/contracts`                  | Ingest (register) a contract.                |
| GET    | `/api/contracts`                  | List contracts.                              |
| GET    | `/api/contracts/:id`              | Get a contract + metadata.                   |
| GET    | `/api/contracts/:id/grade-history`| Grade over time.                             |
| POST   | `/api/analysis`                   | Enqueue (or run inline) an analysis job.     |
| GET    | `/api/analysis/:id`               | Get a completed analysis with findings.      |
| GET    | `/api/analysis/jobs/:id`          | Get an analysis job status.                  |
| GET    | `/api/leaderboard`                | Ecosystem contention ranking.                |
| POST   | `/api/webhooks/github`            | GitHub webhook (HMAC-verified).              |

## How `slipstream-web` consumes this API

The Next.js app calls the REST endpoints above (typically via a typed client
generated from `/docs`'s OpenAPI JSON). Add the web app's origin to
`CORS_ORIGINS`. The leaderboard and per-contract grade-history endpoints back
the dashboards; the analysis endpoints drive the "analyze this contract" flow.

## Testing

```sh
npm test          # unit tests (mocked Prisma/Redis/core; no services needed)
npm run test:e2e  # boots the app with mocked deps; asserts real endpoints
npm run test:cov  # coverage
```

No PostgreSQL or Redis is required for either test suite — Prisma, the queue,
and the core runner are all mocked/guarded.

## Queue behavior without Redis

`QueueModule.register()` inspects `REDIS_HOST` at module-definition time:

- **Set** ⇒ registers BullMQ, the `analysis` queue, and the `AnalysisProcessor`
  worker (real `BullQueueService`).
- **Empty / test env** ⇒ registers only a `NoopQueueService`. Analysis requests
  then run **inline** (the core command is invoked synchronously and persisted)
  so the API stays fully functional without a broker.

## Roadmap / TODOs

These are implemented as clean interfaces + mocks/stubs, not half-features:

- **Stellar RPC/Horizon**: real network clients (currently mocks). See
  `src/stellar/stellar.interfaces.ts`.
- **XDR decoding**: wrap `@stellar/stellar-base`. See `MockXdrDecoder`.
- **GitHub App auth**: authenticate as an installation, fetch PR head, run a
  `DIFF`, and post a check-run. See `WebhooksService.handlePullRequest`.
- **Worker persistence**: have `AnalysisProcessor` persist reports via Prisma
  (the inline path already does). See `src/queue/analysis.processor.ts`.
- **`slipstream profile --json`**: switch the adapter from text parsing to JSON
  once the engine exposes it. See `SlipstreamCoreService.profile`.

## License

MIT © 2026 Slipstream Lab. See [LICENSE](LICENSE).

# Contributing to Slipstream API

Thanks for your interest in contributing. Slipstream API is the orchestration
and persistence layer of the project: correctness, clear interfaces, and honest
tests matter more than breadth of features.

## Ground rules

- **Never commit secrets.** No API keys, DB passwords, private keys, or tokens.
  `.env` is gitignored; only `.env.example` (placeholders) is tracked.
- **Never fabricate external-service behavior.** Where a real Stellar
  RPC/Horizon, GitHub App, or the `slipstream-core` binary is needed, build a
  clean adapter/interface + a testable mock — not fake production behavior.
- **Leave clearly-scoped future work as `// TODO:`** with a clean interface and
  a meaningful test, rather than half-implementing.
- Keep it buildable, lint-clean, and tested at every step.

## Development workflow

1. Branch from `main`.
2. Install and set up:

   ```sh
   npm install
   cp .env.example .env
   docker compose up -d          # local Postgres + Redis
   npm run prisma:generate
   ```

3. Write or update tests alongside your change.
4. Run the full local validation suite before opening a PR:

   ```sh
   npm run prisma:validate
   npm run lint
   npm run build
   npm test
   npm run test:e2e
   ```

5. Open a pull request against `main` and reference the issue it resolves.

## Conventions

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/),
  e.g. `feat(analysis): add profile grading`, `fix(queue): guard missing redis`.
- **Modules**: one Nest module per feature under `src/modules/*`. Cross-cutting
  infrastructure (config, prisma, core, stellar, queue) lives at `src/*`.
- **DTOs**: validate all request input with `class-validator` DTOs and document
  them with `@nestjs/swagger` decorators.
- **Services depend on interfaces**, not concretions, where an external system
  is involved (`CoreRunner`, `QueueService`, the Stellar clients). This keeps
  everything unit-testable with mocks.
- **Formatting/linting**: Prettier + ESLint (typescript-eslint). Run
  `npm run lint:fix` and `npm run format`.

## Testing guidance

- **Unit tests** (`test/unit`): mock Prisma, the queue, and the core runner.
  No database or Redis should be required.
- **E2E tests** (`test/e2e`): boot the app with `overrideProvider` for
  `PrismaService` and `CORE_RUNNER`; assert real HTTP behavior.
- CI runs install → prisma generate → lint → build → test → test:e2e with **no
  external services** (all mocked/guarded).

## Adding a new analysis kind

1. Extend `AnalysisKind` in `prisma/schema.prisma` and the `AnalysisKindDto`.
2. Add a `SlipstreamCoreService` method + normalization, with fixtures + a unit
   test.
3. Persist results in `AnalysisService` and update grading if relevant.

## Code of conduct

Be respectful and constructive. Assume good faith.

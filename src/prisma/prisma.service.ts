import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper around the generated Prisma client that ties its connection
 * lifecycle to the Nest module lifecycle.
 *
 * `onModuleInit` attempts to connect but does NOT throw if the database is
 * unreachable — this keeps the app bootable in environments (tests, CI without
 * Postgres) where no DB is available. Queries issued later will surface their
 * own connection errors, which is the correct behavior.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to the database');
    } catch (error) {
      // Do not crash boot: log and continue. Endpoints that need the DB will
      // fail loudly at query time.
      this.logger.warn(
        `Database connection not established at boot: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

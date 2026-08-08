import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Env } from "@questlearn/config";
import { ENV } from "../config/env.module";

/**
 * Wraps the generated Prisma client with the app's lifecycle so
 * connections open/close alongside Nest, and wires the Postgres
 * driver adapter Prisma 7 requires at runtime (schema.prisma no
 * longer carries a connection URL — see prisma.config.ts for the
 * CLI-side equivalent).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

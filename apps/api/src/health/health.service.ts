import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";
import Redis from "ioredis";
import { Env } from "@questlearn/config";
import { ENV } from "../config/env.module";

export type DependencyStatus = "connected" | "disconnected";

export interface HealthReport {
  web: "running";
  api: "connected";
  database: DependencyStatus;
  redis: DependencyStatus;
  environment: string;
  timestamp: string;
}

/**
 * Owns real connections to Postgres and Redis so /health reflects
 * actual dependency status rather than a hardcoded value. Both
 * clients are created lazily and reused across health checks.
 */
@Injectable()
export class HealthService implements OnModuleDestroy {
  private pool?: Pool;
  private redis?: Redis;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.env.DATABASE_URL,
        connectionTimeoutMillis: 3000,
      });
    }
    return this.pool;
  }

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis(this.env.REDIS_URL, {
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
    }
    return this.redis;
  }

  async checkDatabase(): Promise<DependencyStatus> {
    try {
      const pool = this.getPool();
      await pool.query("SELECT 1");
      return "connected";
    } catch {
      return "disconnected";
    }
  }

  async checkRedis(): Promise<DependencyStatus> {
    try {
      const redis = this.getRedis();
      if (redis.status === "wait" || redis.status === "end") {
        await redis.connect();
      }
      const pong = await redis.ping();
      return pong === "PONG" ? "connected" : "disconnected";
    } catch {
      return "disconnected";
    }
  }

  async getReport(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      web: "running",
      api: "connected",
      database,
      redis,
      environment: this.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
    this.redis?.disconnect();
  }
}

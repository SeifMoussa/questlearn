import { z } from "zod";

/**
 * Shared environment schema for QuestLearn services.
 *
 * Each app should call `loadEnv()` (or `envSchema.parse(process.env)`
 * directly) as early as possible during startup so the process fails
 * fast with a readable error instead of surfacing a confusing runtime
 * failure later (e.g. a DB pool that never connects).
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .url("DATABASE_URL must be a valid connection URL"),
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required")
    .url("REDIS_URL must be a valid connection URL"),

  CSRF_SECRET: z
    .string()
    .min(16, "CSRF_SECRET must be at least 16 characters"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters"),

  API_URL: z.string().url().optional(),
  WEB_URL: z.string().url().optional(),

  // Rate limit applied to the sensitive, unauthenticated endpoints:
  // register/login/forgot-password and join-code redemption.
  // Configurable so tests can use a short window instead of waiting
  // out a real 60-second production window.
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),
  AUTH_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),

  // App-wide default rate limit (every endpoint without its own
  // @Throttle override, notably /auth/refresh and every plain GET
  // read). The 100/60s default matches production's original,
  // untouched value; dev/test raise it via .env/.env.example/CI the
  // same way AUTH_THROTTLE_LIMIT is raised, so a growing Playwright
  // suite's page-load/API-call volume doesn't trip it, without
  // loosening the limit anyone actually deployed relies on.
  GLOBAL_THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  GLOBAL_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Validates `process.env` (or a supplied source object) against the
 * shared schema. Throws `EnvValidationError` with a human-readable
 * summary of every failing field so misconfiguration is obvious in
 * startup logs.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new EnvValidationError(
      `Invalid environment configuration:\n${issues}`,
    );
  }

  return result.data;
}

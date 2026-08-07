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

  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters"),
  CSRF_SECRET: z
    .string()
    .min(16, "CSRF_SECRET must be at least 16 characters"),

  API_URL: z.string().url().optional(),
  WEB_URL: z.string().url().optional(),
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

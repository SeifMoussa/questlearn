import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

// The repo's single .env lives at the workspace root, not in this
// package — point dotenv at it explicitly rather than relying on cwd.
loadDotenv({ path: path.resolve(__dirname, "../../.env") });

// Prisma 7 no longer reads a connection URL from schema.prisma —
// the CLI (migrate, studio, seed) reads it from here instead. The
// running app wires up its own driver adapter at runtime (see
// src/prisma/prisma.service.ts); this is only used by CLI commands.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: 'ts-node --compiler-options {\"module\":\"commonjs\"} prisma/seed.ts',
  },
});

import path from "node:path";
import { config as loadDotenv } from "dotenv";

// Integration tests exercise the real app against the real Postgres
// and Redis started via docker compose, so they need the same
// connection info local dev uses. The repo's single .env lives at
// the workspace root.
loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
process.env.NODE_ENV = "test";

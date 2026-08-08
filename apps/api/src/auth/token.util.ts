import { randomBytes, createHash } from "node:crypto";

/**
 * Generates a URL-safe single-use token (email verification, password
 * reset, refresh token). The raw value is handed to the caller once
 * (embedded in a link, or set as a cookie); only its SHA-256 hash is
 * ever persisted, so a database leak does not expose usable tokens.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

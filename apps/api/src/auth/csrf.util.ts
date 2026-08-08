import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Double-submit CSRF token, HMAC-signed with CSRF_SECRET so a value
 * can't just be guessed/forged — the cookie carries `nonce.signature`,
 * the client echoes the same value back in a header on cookie-
 * authenticated endpoints (/auth/refresh, /auth/logout), and the
 * guard checks both that the signature is valid and that the header
 * matches the cookie exactly.
 */
export function issueCsrfToken(secret: string): string {
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", secret).update(nonce).digest("hex");
  return `${nonce}.${signature}`;
}

export function verifyCsrfToken(secret: string, token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [nonce, signature] = parts;
  const expected = createHmac("sha256", secret).update(nonce).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

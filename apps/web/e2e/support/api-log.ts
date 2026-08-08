import { readFileSync } from "node:fs";

interface LoggedEmail {
  event: string;
  to: string;
  token: string;
}

/**
 * The API's dev EmailService logs verification/reset emails as
 * structured JSON (via Nest's Logger, which pretty-prints objects
 * across multiple lines) instead of sending anything real — see
 * apps/api/src/auth/email/email.service.ts. This scrapes the most
 * recent matching entry out of the API's stdout log so the e2e flow
 * can pick up a token the same way a developer reading the log
 * would, without a real email provider.
 */
export function readLatestToken(
  logPath: string,
  event: "verification_email" | "password_reset_email",
  to: string,
): string {
  const content = readFileSync(logPath, "utf-8");
  const marker = `"event": "${event}"`;

  let searchFrom = content.length;
  for (;;) {
    const markerIdx = content.lastIndexOf(marker, searchFrom);
    if (markerIdx === -1) break;

    const start = content.lastIndexOf("{", markerIdx);
    const end = content.indexOf("}", markerIdx);
    searchFrom = markerIdx - 1;

    if (start === -1 || end === -1) continue;

    try {
      const parsed = JSON.parse(content.slice(start, end + 1)) as LoggedEmail;
      if (parsed.to === to) return parsed.token;
    } catch {
      // Not a clean single-object slice (e.g. nested braces); skip it.
    }
  }

  throw new Error(`No "${event}" log entry found for ${to} in ${logPath}`);
}

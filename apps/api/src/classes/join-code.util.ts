import { randomInt } from "node:crypto";

// Uppercase alphanumeric, excluding characters that are easy to
// misread when a teacher reads a join code aloud or a learner copies
// it by hand: 0/O and 1/I/L.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 8;
export const JOIN_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export function joinCodeExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + JOIN_CODE_TTL_MS);
}

export function isJoinCodeExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

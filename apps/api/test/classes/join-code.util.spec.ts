import {
  JOIN_CODE_LENGTH,
  generateJoinCode,
  isJoinCodeExpired,
  joinCodeExpiry,
} from "../../src/classes/join-code.util";

describe("join-code.util", () => {
  describe("generateJoinCode", () => {
    it("produces an 8-character uppercase alphanumeric code", () => {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect(code).toMatch(/^[A-Z0-9]+$/);
    });

    it("never includes ambiguous characters (0, O, 1, I, L)", () => {
      for (let i = 0; i < 500; i++) {
        const code = generateJoinCode();
        expect(code).not.toMatch(/[0O1IL]/);
      }
    });

    it("generates different codes across calls (collision retry is meaningful)", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 200; i++) {
        codes.add(generateJoinCode());
      }
      // Not a strict uniqueness guarantee (codes are random), but 200
      // draws from a ~2^40 space colliding would indicate a broken
      // generator, not bad luck.
      expect(codes.size).toBeGreaterThan(190);
    });
  });

  describe("joinCodeExpiry", () => {
    it("defaults to 30 days from now", () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const expiry = joinCodeExpiry(now);
      expect(expiry.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });

  describe("isJoinCodeExpired", () => {
    it("is false before the expiry timestamp", () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const expiresAt = new Date("2026-01-02T00:00:00.000Z");
      expect(isJoinCodeExpired(expiresAt, now)).toBe(false);
    });

    it("is true after the expiry timestamp", () => {
      const now = new Date("2026-01-03T00:00:00.000Z");
      const expiresAt = new Date("2026-01-02T00:00:00.000Z");
      expect(isJoinCodeExpired(expiresAt, now)).toBe(true);
    });
  });
});

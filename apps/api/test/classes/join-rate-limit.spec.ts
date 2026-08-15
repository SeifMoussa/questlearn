import type { INestApplication } from "@nestjs/common";
import request from "supertest";

/**
 * Mirrors `test/auth/rate-limit.spec.ts` exactly: `/classes/join`
 * shares the AUTH_THROTTLE_LIMIT/AUTH_THROTTLE_TTL_MS env vars (Module
 * 5 decision), closing the join-code brute-force gap flagged as a
 * known limitation back in Module 2.
 */
describe("classes/join rate limiting (integration)", () => {
  let app: INestApplication;
  const LIMIT = 3;
  const WINDOW_MS = 1500;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = String(LIMIT);
    process.env.AUTH_THROTTLE_TTL_MS = String(WINDOW_MS);
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createTestApp } = require("../support/test-app");
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_THROTTLE_LIMIT;
    delete process.env.AUTH_THROTTLE_TTL_MS;
  });

  it("rejects the (limit + 1)th bad-join-code attempt within the window, then recovers after it elapses", async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post("/classes/join")
        .send({ joinCode: "BADCODE1", name: "Nobody", email: "nobody@example.com", password: "wrongpassword1" });

    const statuses: number[] = [];
    for (let i = 0; i < LIMIT; i++) {
      const res = await attempt();
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s === 404)).toBe(true);

    const overLimitRes = await attempt();
    expect(overLimitRes.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 300));
    const afterWindowRes = await attempt();
    expect(afterWindowRes.status).toBe(404);
  });
});

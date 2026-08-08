import type { INestApplication } from "@nestjs/common";
import request from "supertest";

/**
 * Proves the throttle guard actually rejects the Nth+1 attempt and
 * recovers once the window elapses, against the real app and real
 * Postgres — not a mocked guard. Uses a short window (set via env
 * before the auth controller module is first loaded, since the
 * @Throttle decorator reads it at module-evaluation time) so the
 * test doesn't have to wait out a real 60-second production window.
 */
describe("auth endpoint rate limiting (integration)", () => {
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

  it("rejects the (limit + 1)th request within the window, then recovers after it elapses", async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "nobody@example.com", password: "wrong-password" });

    const statuses: number[] = [];
    for (let i = 0; i < LIMIT; i++) {
      const res = await attempt();
      statuses.push(res.status);
    }
    // All LIMIT attempts should be processed (rejected as bad
    // credentials, not throttled).
    expect(statuses.every((s) => s === 401)).toBe(true);

    const overLimitRes = await attempt();
    expect(overLimitRes.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 300));

    const afterWindowRes = await attempt();
    expect(afterWindowRes.status).toBe(401);
  });
});

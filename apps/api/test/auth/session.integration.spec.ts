import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import { EmailService } from "../../src/auth/email/email.service";

/**
 * Drives the real HTTP surface of the auth module against the real
 * Postgres started via docker compose (see jest.setup.ts) — no
 * mocking of Prisma or the request pipeline.
 */
describe("auth session lifecycle (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `session-${Date.now()}@example.com`;
  const password = "correcthorse123";

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  function extractCookie(setCookieHeader: string[], name: string): string {
    const raw = setCookieHeader.find((c) => c.startsWith(`${name}=`));
    if (!raw) throw new Error(`Cookie ${name} not set`);
    return raw.split(";")[0].split("=").slice(1).join("=");
  }

  it("register -> verify -> login -> protected route -> refresh rotates -> logout invalidates", async () => {
    const emailService = app.get(EmailService);
    const verifySpy = jest.spyOn(emailService, "sendVerificationEmail");

    // 1. Register.
    const registerRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password, name: "Session Tester" })
      .expect(201);
    expect(registerRes.body.message).toMatch(/verify/i);

    const token = verifySpy.mock.calls[0][0].token;
    expect(token).toEqual(expect.any(String));

    // 2. Login before verification is rejected with a distinct state.
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(403);

    // 3. Verify email.
    await request(app.getHttpServer())
      .post("/auth/verify-email")
      .send({ token })
      .expect(201);

    // 4. Login succeeds and issues an access token + session cookies.
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);

    const accessToken = loginRes.body.accessToken;
    expect(accessToken).toEqual(expect.any(String));
    const setCookies = loginRes.headers["set-cookie"] as unknown as string[];
    const refreshToken = extractCookie(setCookies, "refresh_token");
    const csrfToken = extractCookie(setCookies, "csrf_token");

    // 5. The access token works on a protected route.
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    // 6. A bad/missing access token is rejected.
    await request(app.getHttpServer()).get("/auth/me").expect(401);

    // 7. Refresh without a CSRF header is rejected.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshToken}`, `csrf_token=${csrfToken}`])
      .expect(403);

    // 8. Refresh with a matching CSRF header rotates the token.
    const refreshRes = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshToken}`, `csrf_token=${csrfToken}`])
      .set("x-csrf-token", csrfToken)
      .expect(200);

    const newSetCookies = refreshRes.headers["set-cookie"] as unknown as string[];
    const newRefreshToken = extractCookie(newSetCookies, "refresh_token");
    const newCsrfToken = extractCookie(newSetCookies, "csrf_token");
    expect(newRefreshToken).not.toBe(refreshToken);

    // 9. The old refresh token is now invalid (rotation revoked it).
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshToken}`, `csrf_token=${csrfToken}`])
      .set("x-csrf-token", csrfToken)
      .expect(401);

    // 10. Logout revokes the current (new) session.
    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Cookie", [`refresh_token=${newRefreshToken}`, `csrf_token=${newCsrfToken}`])
      .set("x-csrf-token", newCsrfToken)
      .expect(200);

    // 11. The just-logged-out refresh token no longer works either.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", [`refresh_token=${newRefreshToken}`, `csrf_token=${newCsrfToken}`])
      .set("x-csrf-token", newCsrfToken)
      .expect(401);
  });
});

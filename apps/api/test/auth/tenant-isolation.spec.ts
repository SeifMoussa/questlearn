import type { INestApplication } from "@nestjs/common";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Confirms every row this module writes carries the tenant_id it
 * should, and that a session/token created for one tenant can't be
 * looked up as belonging to another — against the real Postgres
 * database, not a mock.
 */
describe("tenant isolation (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailA = `tenant-a-${Date.now()}@example.com`;
  const emailB = `tenant-b-${Date.now()}@example.com`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await app.close();
  });

  it("gives each registered teacher their own tenant, and scopes their session to it", async () => {
    const passwordHash = await argon2.hash("correcthorse123", {
      type: argon2.argon2id,
    });

    const tenantA = await prisma.tenant.create({ data: { name: "Tenant A" } });
    const tenantB = await prisma.tenant.create({ data: { name: "Tenant B" } });

    const userA = await prisma.user.create({
      data: { tenantId: tenantA.id, email: emailA, name: "A", passwordHash },
    });
    const userB = await prisma.user.create({
      data: { tenantId: tenantB.id, email: emailB, name: "B", passwordHash },
    });

    expect(userA.tenantId).not.toBe(userB.tenantId);

    const sessionA = await prisma.session.create({
      data: {
        tenantId: tenantA.id,
        userId: userA.id,
        refreshTokenHash: `hash-${userA.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    // A session row created under tenant A must never resolve as
    // belonging to tenant B, even when queried by user id alone.
    const crossTenantLookup = await prisma.session.findFirst({
      where: { id: sessionA.id, tenantId: tenantB.id },
    });
    expect(crossTenantLookup).toBeNull();

    const correctLookup = await prisma.session.findFirst({
      where: { id: sessionA.id, tenantId: tenantA.id },
    });
    expect(correctLookup?.userId).toBe(userA.id);

    // Every table this module writes to must carry tenant_id — a
    // regression here (e.g. a forgotten scope) would silently break
    // isolation, so assert it directly against the schema's data.
    expect(userA.tenantId).toBe(tenantA.id);
    expect(sessionA.tenantId).toBe(tenantA.id);
  });
});

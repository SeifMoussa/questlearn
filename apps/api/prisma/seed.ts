import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";

/**
 * Seeds one fictional demo teacher account so the login screen and
 * manual testing have something real to authenticate against. Purely
 * fictional data, per the master spec's ethics constraints — this is
 * not a real person or institution.
 */
const DEMO_TENANT_NAME = "Maple Grove Elementary (Demo)";
const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_NAME = "Jordan Rivera";
const DEMO_PASSWORD = "DemoTeacher2026!";

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const existing = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
    });
    if (existing) {
      console.log(`Demo teacher already exists (${DEMO_EMAIL}); skipping.`);
      return;
    }

    const passwordHash = await argon2.hash(DEMO_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const tenant = await prisma.tenant.create({
      data: { name: DEMO_TENANT_NAME },
    });

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: DEMO_EMAIL,
        name: DEMO_NAME,
        passwordHash,
        role: "teacher",
        emailVerifiedAt: new Date(),
      },
    });

    console.log("Seeded demo teacher account:");
    console.log(`  email:    ${user.email}`);
    console.log(`  password: ${DEMO_PASSWORD} (development only)`);
    console.log(`  tenant:   ${tenant.name}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});

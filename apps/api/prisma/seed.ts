import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { generateJoinCode, joinCodeExpiry } from "../src/classes/join-code.util";

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
    let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

    if (!user) {
      const passwordHash = await argon2.hash(DEMO_PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });

      const tenant = await prisma.tenant.create({
        data: { name: DEMO_TENANT_NAME },
      });

      user = await prisma.user.create({
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
    } else {
      console.log(`Demo teacher already exists (${DEMO_EMAIL}).`);
    }

    await seedDemoClasses(prisma, user.tenantId, user.id);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Fictional demo classes and roster entries for the demo teacher, so
 * the class-list and class-detail screens have real populated content
 * to screenshot instead of an empty state. No real student data.
 */
async function seedDemoClasses(prisma: PrismaClient, tenantId: string, teacherId: string): Promise<void> {
  const existingClasses = await prisma.class.count({ where: { tenantId, teacherId } });
  if (existingClasses > 0) {
    console.log("Demo classes already exist; skipping.");
    return;
  }

  const homeroom = await prisma.class.create({
    data: {
      tenantId,
      teacherId,
      name: "Period 3 — Earth Science",
      joinCode: generateJoinCode(),
      joinCodeExpiresAt: joinCodeExpiry(),
    },
  });

  await prisma.rosterEntry.createMany({
    data: [
      { tenantId, classId: homeroom.id, name: "Avery Kim", email: "avery.kim@example.com" },
      { tenantId, classId: homeroom.id, name: "Jordan Patel", email: "jordan.patel@example.com" },
      { tenantId, classId: homeroom.id, name: "Sam Rivera", email: null },
    ],
  });

  const afterSchool = await prisma.class.create({
    data: {
      tenantId,
      teacherId,
      name: "After-School Coding Club",
      joinCode: generateJoinCode(),
      joinCodeExpiresAt: joinCodeExpiry(),
    },
  });

  await prisma.rosterEntry.createMany({
    data: [
      { tenantId, classId: afterSchool.id, name: "Riley Chen", email: "riley.chen@example.com" },
      { tenantId, classId: afterSchool.id, name: "Morgan Diaz", email: null },
    ],
  });

  console.log("Seeded demo classes:");
  console.log(`  ${homeroom.name} (join code ${homeroom.joinCode})`);
  console.log(`  ${afterSchool.name} (join code ${afterSchool.joinCode})`);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});

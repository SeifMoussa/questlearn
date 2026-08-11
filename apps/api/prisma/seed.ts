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
    await seedDemoQuestions(prisma, user.tenantId, user.id);
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

/**
 * Fictional, curriculum-plausible demo questions covering all 5
 * locked question types, so the question-bank screenshot shows
 * varied real content rather than one type repeated. Idempotent the
 * same way seedDemoClasses is — skips entirely if the teacher already
 * has questions, so re-running the seed script never duplicates rows.
 */
async function seedDemoQuestions(prisma: PrismaClient, tenantId: string, teacherId: string): Promise<void> {
  const existingQuestions = await prisma.question.count({ where: { tenantId, teacherId } });
  if (existingQuestions > 0) {
    console.log("Demo questions already exist; skipping.");
    return;
  }

  type SeedQuestion = Parameters<typeof createSeedQuestion>[3];

  const questions: SeedQuestion[] = [
    {
      type: "single_choice",
      prompt: "Which planet is known as the Red Planet?",
      points: 1,
      options: [
        { id: "a", text: "Venus" },
        { id: "b", text: "Mars" },
        { id: "c", text: "Jupiter" },
      ],
      correctAnswer: "b",
      hint: "It's named after the Roman god of war.",
    },
    {
      type: "multiple_choice",
      prompt: "Which of the following are prime numbers?",
      points: 2,
      options: [
        { id: "a", text: "2" },
        { id: "b", text: "4" },
        { id: "c", text: "7" },
        { id: "d", text: "9" },
      ],
      correctAnswer: ["a", "c"],
    },
    {
      type: "true_false",
      prompt: "The Earth revolves around the Sun.",
      points: 1,
      correctAnswer: true,
    },
    {
      type: "short_text",
      prompt: "What is the chemical symbol for water?",
      points: 1,
      correctAnswer: ["H2O", "h2o"],
      explanation: "Water is composed of two hydrogen atoms and one oxygen atom.",
    },
    {
      type: "numeric",
      prompt: "What is the boiling point of water at sea level, in Celsius?",
      points: 1,
      correctAnswer: { value: 100, tolerance: 1 },
    },
  ];

  for (const question of questions) {
    await createSeedQuestion(prisma, tenantId, teacherId, question);
  }

  console.log(`Seeded ${questions.length} demo questions (one per question type).`);
}

async function createSeedQuestion(
  prisma: PrismaClient,
  tenantId: string,
  teacherId: string,
  question: {
    type: "single_choice" | "multiple_choice" | "true_false" | "short_text" | "numeric";
    prompt: string;
    points: number;
    options?: { id: string; text: string }[];
    correctAnswer: unknown;
    hint?: string;
    explanation?: string;
  },
): Promise<void> {
  const created = await prisma.question.create({
    data: { tenantId, teacherId },
  });

  const version = await prisma.questionVersion.create({
    data: {
      questionId: created.id,
      tenantId,
      versionNumber: 1,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      hint: question.hint ?? null,
      explanation: question.explanation ?? null,
      options: question.options ?? undefined,
      correctAnswer: question.correctAnswer as never,
    },
  });

  await prisma.question.update({
    where: { id: created.id },
    data: { currentVersionId: version.id },
  });
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});

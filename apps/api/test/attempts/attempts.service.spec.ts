import { AttemptsService } from "../../src/attempts/attempts.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { SecurityLogger } from "../../src/auth/security-logger.service";
import { MasteryService } from "../../src/mastery/mastery.service";
import { GamificationService } from "../../src/gamification/gamification.service";

/**
 * Isolates the atomic claim pattern in `submit()` from a real database:
 * asserts the branch taken depends only on the transaction-scoped
 * `updateMany` result's `count`, not on a separate read of the
 * attempt's status (which would reintroduce the exact race the claim
 * pattern exists to close — see the doc comment on `submit()`).
 */
describe("AttemptsService.submit — claim pattern (unit)", () => {
  const ctx = { userId: "learner-1", tenantId: "tenant-1" };

  function baseAttempt(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "attempt-1",
      tenantId: "tenant-1",
      assignmentId: "assignment-1",
      learnerId: "learner-1",
      status: "in_progress",
      startedAt: new Date(),
      submittedAt: null,
      score: null,
      ...overrides,
    };
  }

  function makeTx(claimCount: number) {
    return {
      attempt: {
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
        update: jest.fn(),
      },
      assignment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "assignment-1", activityId: "activity-1" }),
      },
      activityQuestion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      attemptResponse: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
  }

  function makePrisma(claimCount: number) {
    const tx = makeTx(claimCount);
    return {
      attempt: {
        findFirst: jest.fn().mockResolvedValue(baseAttempt()),
      },
      activityQuestion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
      __tx: tx,
    };
  }

  it("count === 1 (won the claim): proceeds to grade and logs once", async () => {
    const prisma = makePrisma(1);
    const securityLogger = { log: jest.fn() } as unknown as SecurityLogger;
    const masteryService = { recordEvidenceForAttempt: jest.fn().mockResolvedValue([]) } as unknown as MasteryService;
    const gamificationService = { awardForAttempt: jest.fn().mockResolvedValue(undefined) } as unknown as GamificationService;
    const service = new AttemptsService(prisma as unknown as PrismaService, securityLogger, masteryService, gamificationService);

    // loadAttemptDetail (called at the end) re-fetches the attempt via
    // a plain findFirst outside the transaction.
    prisma.attempt.findFirst.mockResolvedValue(
      baseAttempt({ status: "submitted", submittedAt: new Date(), responses: [], assignment: { activityId: "activity-1" } }),
    );

    await service.submit(ctx, "attempt-1");

    expect(prisma.__tx.attempt.updateMany).toHaveBeenCalledWith({
      where: { id: "attempt-1", status: "in_progress" },
      data: expect.objectContaining({ status: "submitted" }),
    });
    expect(prisma.__tx.attempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ score: expect.any(Number) }) }),
    );
    expect(securityLogger.log).toHaveBeenCalledWith("attempt_submitted", expect.any(Object));
  });

  it("count === 0 (lost the claim / duplicate submit): does not re-grade or log again", async () => {
    const prisma = makePrisma(0);
    const securityLogger = { log: jest.fn() } as unknown as SecurityLogger;
    const masteryService = { recordEvidenceForAttempt: jest.fn().mockResolvedValue([]) } as unknown as MasteryService;
    const gamificationService = { awardForAttempt: jest.fn().mockResolvedValue(undefined) } as unknown as GamificationService;
    const service = new AttemptsService(prisma as unknown as PrismaService, securityLogger, masteryService, gamificationService);

    prisma.attempt.findFirst.mockResolvedValue(
      baseAttempt({ status: "submitted", submittedAt: new Date(), score: 0.75, responses: [], assignment: { activityId: "activity-1" } }),
    );

    await service.submit(ctx, "attempt-1");

    // Grading path must never run when the claim was lost.
    expect(prisma.__tx.assignment.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.__tx.attempt.update).not.toHaveBeenCalled();
    expect(securityLogger.log).not.toHaveBeenCalled();
  });
});

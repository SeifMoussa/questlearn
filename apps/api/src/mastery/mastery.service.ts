import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  MasteryState,
  distinctAttemptCount,
  effectiveResponseScore,
  stateForEvidence,
  weightedMasteryScore,
} from "./mastery-formula";

export interface TeacherContext {
  userId: string;
  tenantId: string;
}

export interface LearnerContext {
  userId: string;
  tenantId: string;
}

export interface GradedResponseForEvidence {
  attemptResponseId: string;
  questionId: string;
  pointsAwarded: number;
  points: number;
  hintViewed: boolean;
}

export interface ConceptMasteryResult {
  conceptId: string;
  conceptName: string;
  score: number | null;
  state: MasteryState;
  evidenceCount: number;
  distinctAttemptCount: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

@Injectable()
export class MasteryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called from inside `AttemptsService.submit()`'s existing grading
   * transaction, after every `AttemptResponse` has been graded —
   * never in a second transaction. For each graded response, looks up
   * the underlying question's current `QuestionConcept` tags and
   * inserts one `MasteryEvidence` row per tagged concept, with
   * `responseScore` frozen at `(pointsAwarded/points) * hint penalty`.
   *
   * Idempotent by construction: `submit()`'s atomic claim (an
   * `updateMany` conditioned on `status: "in_progress"`, inside the
   * same transaction) means only the winning caller ever reaches this
   * code for a given attempt, and the `@@unique([attemptResponseId,
   * conceptId])` constraint plus `skipDuplicates` make a duplicate
   * insert a silent no-op rather than an error even if this were ever
   * invoked twice for the same response.
   *
   * Returns the distinct concept ids actually touched (tagged onto at
   * least one graded question), so `AttemptsService.submit()` can pass
   * them straight to `GamificationService.awardForAttempt` for
   * `concept_champion` evaluation without a second, duplicate
   * `QuestionConcept` lookup.
   */
  async recordEvidenceForAttempt(
    tx: Prisma.TransactionClient,
    ctx: { tenantId: string; learnerId: string },
    gradedResponses: GradedResponseForEvidence[],
  ): Promise<string[]> {
    if (gradedResponses.length === 0) return [];

    const questionIds = Array.from(new Set(gradedResponses.map((r) => r.questionId)));
    const tags = await tx.questionConcept.findMany({
      where: { questionId: { in: questionIds }, tenantId: ctx.tenantId },
    });
    if (tags.length === 0) return [];

    const conceptIdsByQuestion = new Map<string, string[]>();
    for (const tag of tags) {
      const list = conceptIdsByQuestion.get(tag.questionId) ?? [];
      list.push(tag.conceptId);
      conceptIdsByQuestion.set(tag.questionId, list);
    }

    const rows: Prisma.MasteryEvidenceCreateManyInput[] = [];
    const touchedConceptIds = new Set<string>();
    for (const response of gradedResponses) {
      const conceptIds = conceptIdsByQuestion.get(response.questionId);
      if (!conceptIds || conceptIds.length === 0) continue;

      const responseScore = effectiveResponseScore(response.pointsAwarded, response.points, response.hintViewed);
      for (const conceptId of conceptIds) {
        touchedConceptIds.add(conceptId);
        rows.push({
          tenantId: ctx.tenantId,
          learnerId: ctx.learnerId,
          conceptId,
          attemptResponseId: response.attemptResponseId,
          responseScore,
          hintViewed: response.hintViewed,
        });
      }
    }

    if (rows.length === 0) return [];

    await tx.masteryEvidence.createMany({ data: rows, skipDuplicates: true });
    return Array.from(touchedConceptIds);
  }

  /**
   * Live aggregation — no cached mastery value is ever read or
   * written. `daysSinceRecorded` is computed against `new Date()` at
   * call time, so the same evidence set scores differently on
   * successive calls as it ages.
   */
  private aggregateEvidence(
    evidenceByConcept: Map<string, { responseScore: number; recordedAt: Date; attemptId: string }[]>,
    conceptId: string,
    conceptName: string,
    now: Date,
  ): ConceptMasteryResult {
    const evidence = evidenceByConcept.get(conceptId) ?? [];
    if (evidence.length === 0) {
      return { conceptId, conceptName, score: null, state: "not_started", evidenceCount: 0, distinctAttemptCount: 0 };
    }

    const score = weightedMasteryScore(
      evidence.map((e) => ({
        effectiveResponseScore: e.responseScore,
        daysSinceRecorded: (now.getTime() - e.recordedAt.getTime()) / MS_PER_DAY,
      })),
    );

    const evidenceCount = evidence.length;
    const attempts = distinctAttemptCount(evidence);

    return {
      conceptId,
      conceptName,
      score,
      state: score === null ? "not_started" : stateForEvidence(score, evidenceCount, attempts),
      evidenceCount,
      distinctAttemptCount: attempts,
    };
  }

  /**
   * Returns one result per concept the learner has ANY evidence for
   * (or per `conceptIds`, if given — still tenant-scoped to the
   * learner's own tenant). A concept with zero evidence never appears
   * unless explicitly requested via `conceptIds`, matching the locked
   * "no mastery row at all" design for not-started concepts.
   */
  async getMasteryForLearner(ctx: LearnerContext, conceptIds?: string[]): Promise<ConceptMasteryResult[]> {
    return this.computeMasteryForLearner(this.prisma, ctx, conceptIds);
  }

  /**
   * Same aggregation as `getMasteryForLearner`, but runs against a
   * transaction client instead of the module-level `PrismaService` —
   * so it can see writes (e.g. the `MasteryEvidence` rows this same
   * attempt's grading just inserted) that haven't committed yet.
   * `GamificationService.awardForAttempt` calls this from inside
   * `AttemptsService.submit()`'s own grading transaction to detect
   * "a touched concept just reached mastered", which would be
   * impossible via `this.prisma` (a separate connection reading
   * committed data only) without a second round trip after commit.
   */
  async getMasteryForLearnerInTx(
    tx: Prisma.TransactionClient,
    ctx: LearnerContext,
    conceptIds?: string[],
  ): Promise<ConceptMasteryResult[]> {
    return this.computeMasteryForLearner(tx, ctx, conceptIds);
  }

  private async computeMasteryForLearner(
    client: PrismaService | Prisma.TransactionClient,
    ctx: LearnerContext,
    conceptIds?: string[],
  ): Promise<ConceptMasteryResult[]> {
    const evidence = await client.masteryEvidence.findMany({
      where: {
        tenantId: ctx.tenantId,
        learnerId: ctx.userId,
        ...(conceptIds && conceptIds.length > 0 ? { conceptId: { in: conceptIds } } : {}),
      },
      include: { concept: true, attemptResponse: { select: { attemptId: true } } },
    });

    const now = new Date();
    const evidenceByConcept = new Map<string, { responseScore: number; recordedAt: Date; attemptId: string }[]>();
    const conceptNames = new Map<string, string>();
    for (const row of evidence) {
      const list = evidenceByConcept.get(row.conceptId) ?? [];
      list.push({ responseScore: row.responseScore, recordedAt: row.recordedAt, attemptId: row.attemptResponse.attemptId });
      evidenceByConcept.set(row.conceptId, list);
      conceptNames.set(row.conceptId, row.concept.name);
    }

    return Array.from(conceptNames.entries()).map(([conceptId, name]) =>
      this.aggregateEvidence(evidenceByConcept, conceptId, name, now),
    );
  }

  /**
   * Teacher-facing class aggregate: every active roster learner x
   * every concept with ANY evidence within this class's learners.
   * Tenant+owner scoped via the class (404, not 403, on cross-tenant
   * or nonexistent), matching every other module's posture.
   */
  async getMasteryForClass(ctx: TeacherContext, classId: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenantId, teacherId: ctx.userId },
    });
    if (!cls) {
      throw new NotFoundException("Class not found.");
    }

    const roster = await this.prisma.rosterEntry.findMany({
      where: { classId: cls.id, removedAt: null, userId: { not: null } },
      orderBy: { addedAt: "asc" },
    });
    const learnerIds = roster.map((r) => r.userId).filter((id): id is string => !!id);

    if (learnerIds.length === 0) {
      return { learners: [] };
    }

    const evidence = await this.prisma.masteryEvidence.findMany({
      where: { tenantId: ctx.tenantId, learnerId: { in: learnerIds } },
      include: { concept: true, attemptResponse: { select: { attemptId: true } } },
    });

    const now = new Date();
    const byLearnerConcept = new Map<string, Map<string, { responseScore: number; recordedAt: Date; attemptId: string }[]>>();
    const conceptNames = new Map<string, string>();

    for (const row of evidence) {
      conceptNames.set(row.conceptId, row.concept.name);
      const byConcept = byLearnerConcept.get(row.learnerId) ?? new Map();
      const list = byConcept.get(row.conceptId) ?? [];
      list.push({ responseScore: row.responseScore, recordedAt: row.recordedAt, attemptId: row.attemptResponse.attemptId });
      byConcept.set(row.conceptId, list);
      byLearnerConcept.set(row.learnerId, byConcept);
    }

    const conceptIds = Array.from(conceptNames.keys());

    const learners = roster
      .filter((r) => r.userId)
      .map((r) => {
        const byConcept = byLearnerConcept.get(r.userId!) ?? new Map();
        const concepts = conceptIds
          .map((conceptId) => this.aggregateEvidence(byConcept, conceptId, conceptNames.get(conceptId)!, now))
          .filter((c) => c.state !== "not_started");
        return { learnerId: r.userId!, learnerName: r.name, concepts };
      });

    return { learners };
  }
}

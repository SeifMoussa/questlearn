import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MasteryService } from "../mastery/mastery.service";
import { GamificationService } from "../gamification/gamification.service";
import { QuestsService } from "../quests/quests.service";
import { MasteryState } from "../mastery/mastery-formula";
import { CsvColumn, averageScore, completionRate, correctRate, hintViewRate, toCsv } from "./report-formula";

export interface TeacherContext {
  userId: string;
  tenantId: string;
}

interface AssignmentReportRow {
  assignmentId: string;
  title: string;
  dueAt: Date;
  assignedCount: number;
  submittedCount: number;
  completionRate: number | null;
  averageScore: number | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masteryService: MasteryService,
    private readonly gamificationService: GamificationService,
    private readonly questsService: QuestsService,
  ) {}

  // ---------------------------------------------------------------
  // Teacher dashboard: GET /classes/:id/report
  // ---------------------------------------------------------------

  /**
   * `assignedCount` uses the class's CURRENT active roster size for
   * every assignment, including this class's older ones — a teacher
   * reads "assigned" as "how many of my enrolled students should have
   * done this," and no historical roster snapshot is tracked anywhere
   * (`RosterEntry.removedAt` only marks removal, not "as of when").
   * Documented as a known limitation rather than reconstructed.
   */
  private async buildAssignmentRows(tenantId: string, classId: string): Promise<AssignmentReportRow[]> {
    const activeRosterCount = await this.prisma.rosterEntry.count({ where: { classId, removedAt: null } });

    const assignments = await this.prisma.assignment.findMany({
      where: { tenantId, classId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        activity: { select: { title: true } },
        attempts: { where: { status: "submitted" }, select: { score: true } },
      },
    });

    return assignments.map((a) => {
      const scores = a.attempts.map((r) => r.score).filter((s): s is number => s !== null);
      return {
        assignmentId: a.id,
        title: a.activity.title,
        dueAt: a.dueAt,
        assignedCount: activeRosterCount,
        submittedCount: a.attempts.length,
        completionRate: completionRate(activeRosterCount, a.attempts.length),
        averageScore: averageScore(scores),
      };
    });
  }

  /** Scoped by tenant AND owning teacher. A cross-tenant/nonexistent class 404s, never a distinct 403. */
  private async findOwnedClassOrThrow(ctx: TeacherContext, classId: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, tenantId: ctx.tenantId, teacherId: ctx.userId } });
    if (!cls) {
      throw new NotFoundException("Class not found.");
    }
    return cls;
  }

  async getClassReport(ctx: TeacherContext, classId: string) {
    const cls = await this.findOwnedClassOrThrow(ctx, classId);

    const [assignmentRows, masteryByClass, roster] = await Promise.all([
      this.buildAssignmentRows(ctx.tenantId, cls.id),
      this.masteryService.getMasteryForClass(ctx, cls.id),
      this.prisma.rosterEntry.findMany({ where: { classId: cls.id, removedAt: null }, orderBy: { addedAt: "asc" } }),
    ]);

    const totalAssigned = assignmentRows.reduce((sum, r) => sum + r.assignedCount, 0);
    const totalSubmitted = assignmentRows.reduce((sum, r) => sum + r.submittedCount, 0);
    const allScores = assignmentRows
      .map((r) => r.averageScore)
      .filter((s): s is number => s !== null);

    // Compact per-concept state-count summary, not the full per-learner
    // grid Module 6's /classes/:id/mastery page already renders — a
    // learner only ever appears here for a concept it has evidence
    // for, matching MasteryService's own "not_started never appears"
    // convention (getMasteryForClass already filters those out).
    const conceptSummaries = new Map<
      string,
      { conceptId: string; conceptName: string; beginning: number; developing: number; proficient: number; mastered: number }
    >();
    for (const learner of masteryByClass.learners) {
      for (const concept of learner.concepts) {
        const state = concept.state as Exclude<MasteryState, "not_started">;
        const entry = conceptSummaries.get(concept.conceptId) ?? {
          conceptId: concept.conceptId,
          conceptName: concept.conceptName,
          beginning: 0,
          developing: 0,
          proficient: 0,
          mastered: 0,
        };
        entry[state] += 1;
        conceptSummaries.set(concept.conceptId, entry);
      }
    }

    return {
      classId: cls.id,
      className: cls.name,
      summary: {
        // Using totals across assignments (not averaging per-assignment
        // rates) so a class with one huge and one tiny assignment isn't
        // skewed toward the smaller one.
        overallCompletionRate: completionRate(totalAssigned, totalSubmitted),
        overallAverageScore: averageScore(allScores),
      },
      assignments: assignmentRows,
      masterySummary: Array.from(conceptSummaries.values()),
      learners: roster.map((r) => ({ rosterEntryId: r.id, name: r.name, learnerId: r.userId })),
    };
  }

  private formatPercent(value: number | null): string {
    return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
  }

  async getClassReportCsv(ctx: TeacherContext, classId: string): Promise<string> {
    const cls = await this.findOwnedClassOrThrow(ctx, classId);
    const rows = await this.buildAssignmentRows(ctx.tenantId, cls.id);

    const columns: CsvColumn<AssignmentReportRow>[] = [
      { header: "Assignment", value: (r) => r.title },
      { header: "Due Date", value: (r) => r.dueAt.toISOString().slice(0, 10) },
      { header: "Assigned", value: (r) => r.assignedCount },
      { header: "Submitted", value: (r) => r.submittedCount },
      { header: "Completion Rate", value: (r) => this.formatPercent(r.completionRate) },
      { header: "Average Score", value: (r) => this.formatPercent(r.averageScore) },
    ];

    return toCsv(rows, columns);
  }

  // ---------------------------------------------------------------
  // Question analysis: GET /activities/:id/report
  // ---------------------------------------------------------------

  async getActivityReport(ctx: TeacherContext, activityId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, tenantId: ctx.tenantId, teacherId: ctx.userId },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: { pinnedVersion: true, question: { include: { currentVersion: true } } },
        },
      },
    });
    if (!activity) {
      throw new NotFoundException("Activity not found.");
    }

    const activityQuestionIds = activity.questions.map((aq) => aq.id);
    const responses =
      activityQuestionIds.length > 0
        ? await this.prisma.attemptResponse.findMany({
            where: { tenantId: ctx.tenantId, activityQuestionId: { in: activityQuestionIds }, attempt: { status: "submitted" } },
            select: { activityQuestionId: true, isCorrect: true, pointsAwarded: true, hintViewed: true },
          })
        : [];

    const responsesByAQ = new Map<string, typeof responses>();
    for (const r of responses) {
      const list = responsesByAQ.get(r.activityQuestionId) ?? [];
      list.push(r);
      responsesByAQ.set(r.activityQuestionId, list);
    }

    const questions = activity.questions.map((aq) => {
      // Same pin-vs-live fallback ActivitiesService.resolveContent uses
      // — a draft activity's questions resolve off the live current
      // version since nothing is pinned yet.
      const version = aq.pinnedVersion ?? aq.question.currentVersion!;
      const rs = responsesByAQ.get(aq.id) ?? [];
      const graded = rs.length;
      const correct = rs.filter((r) => r.isCorrect === true).length;
      const hinted = rs.filter((r) => r.hintViewed).length;
      const pointsSum = rs.reduce((sum, r) => sum + (r.pointsAwarded ?? 0), 0);

      return {
        activityQuestionId: aq.id,
        order: aq.order,
        prompt: version.prompt,
        type: version.type,
        points: version.points,
        submittedResponseCount: graded,
        correctCount: correct,
        correctRate: correctRate(correct, graded),
        averagePointsAwarded: graded > 0 ? pointsSum / graded : null,
        hintViewedCount: hinted,
        hintViewRate: hintViewRate(hinted, graded),
      };
    });

    return { activityId: activity.id, title: activity.title, status: activity.status, questions };
  }

  // ---------------------------------------------------------------
  // Learner report: GET /classes/:classId/learners/:learnerId/report
  // ---------------------------------------------------------------

  /**
   * `classId` in the URL is used ONLY for the authorization check
   * (this learner must have an active roster entry in a class this
   * teacher owns) — the report CONTENT below covers the learner's
   * attempts across every class this teacher teaches them in, not
   * just this one, since a teacher reasonably wants the full picture
   * of a student they see in multiple sections. Still fully
   * tenant+teacher scoped throughout, never leaking another teacher's
   * data.
   */
  async getLearnerReport(ctx: TeacherContext, classId: string, learnerId: string) {
    const cls = await this.findOwnedClassOrThrow(ctx, classId);

    const rosterEntry = await this.prisma.rosterEntry.findFirst({
      where: { classId: cls.id, userId: learnerId, removedAt: null },
    });
    if (!rosterEntry) {
      throw new NotFoundException("Learner not found.");
    }

    const learner = await this.prisma.user.findFirstOrThrow({ where: { id: learnerId, tenantId: ctx.tenantId } });

    const teacherClasses = await this.prisma.class.findMany({
      where: { tenantId: ctx.tenantId, teacherId: ctx.userId },
      select: { id: true },
    });
    const teacherClassIds = teacherClasses.map((c) => c.id);

    const learnerCtx = { userId: learnerId, tenantId: ctx.tenantId };

    const [attempts, mastery, gamification, quests] = await Promise.all([
      this.prisma.attempt.findMany({
        where: { tenantId: ctx.tenantId, learnerId, assignment: { classId: { in: teacherClassIds } } },
        orderBy: { createdAt: "desc" },
        include: { assignment: { include: { activity: { select: { title: true } }, class: { select: { name: true } } } } },
      }),
      this.masteryService.getMasteryForLearner(learnerCtx),
      this.gamificationService.getProfile(learnerCtx),
      this.questsService.findAllForLearner(learnerCtx),
    ]);

    return {
      learner: { id: learner.id, name: learner.name, email: learner.email },
      attempts: attempts.map((a) => ({
        assignmentId: a.assignmentId,
        activityTitle: a.assignment.activity.title,
        className: a.assignment.class.name,
        dueAt: a.assignment.dueAt,
        status: a.status,
        score: a.score,
        submittedAt: a.submittedAt,
      })),
      mastery,
      gamification,
      quests,
    };
  }
}

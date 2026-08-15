import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityLogger } from "../auth/security-logger.service";
import { CreateAssignmentDto, UpdateAssignmentDto } from "./dto/assignment.dto";

export interface TeacherContext {
  userId: string;
  tenantId: string;
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLogger,
  ) {}

  /**
   * Rejects creating an assignment from a non-published activity — an
   * assignment/attempt can only ever grade against
   * `ActivityQuestion.pinnedVersionId`, which is only ever set at
   * publish time (Module 4). A class or activity outside the caller's
   * tenant/ownership 404s, never 403s, matching every prior module.
   */
  async create(ctx: TeacherContext, dto: CreateAssignmentDto) {
    const cls = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId: ctx.tenantId, teacherId: ctx.userId },
    });
    if (!cls) {
      throw new NotFoundException("Class not found.");
    }

    const activity = await this.prisma.activity.findFirst({
      where: { id: dto.activityId, tenantId: ctx.tenantId, teacherId: ctx.userId },
    });
    if (!activity) {
      throw new NotFoundException("Activity not found.");
    }
    if (activity.status !== "published") {
      throw new BadRequestException("Only a published activity can be assigned.");
    }

    const created = await this.prisma.assignment.create({
      data: {
        tenantId: ctx.tenantId,
        teacherId: ctx.userId,
        classId: cls.id,
        activityId: activity.id,
        dueAt: new Date(dto.dueAt),
      },
    });

    this.securityLogger.log("assignment_created", {
      assignmentId: created.id,
      classId: cls.id,
      activityId: activity.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return created;
  }

  async findAllForTeacher(ctx: TeacherContext, filter: { classId?: string; activityId?: string } = {}) {
    const where: Prisma.AssignmentWhereInput = {
      tenantId: ctx.tenantId,
      teacherId: ctx.userId,
      archivedAt: null,
      ...(filter.classId ? { classId: filter.classId } : {}),
      ...(filter.activityId ? { activityId: filter.activityId } : {}),
    };

    return this.prisma.assignment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { class: true, activity: true },
    });
  }

  private async findOwnedOrThrow(ctx: TeacherContext, assignmentId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, tenantId: ctx.tenantId, teacherId: ctx.userId },
      include: { class: true, activity: true },
    });
    if (!assignment) {
      throw new NotFoundException("Assignment not found.");
    }
    return assignment;
  }

  async findOne(ctx: TeacherContext, assignmentId: string) {
    return this.findOwnedOrThrow(ctx, assignmentId);
  }

  /**
   * Only `dueAt` is patchable — scheduling metadata, not content, so
   * it doesn't conflict with activity publish-immutability the way
   * changing `activityId`/`classId` would.
   */
  async update(ctx: TeacherContext, assignmentId: string, dto: UpdateAssignmentDto) {
    const assignment = await this.findOwnedOrThrow(ctx, assignmentId);

    const updated = await this.prisma.assignment.update({
      where: { id: assignment.id },
      data: { dueAt: new Date(dto.dueAt) },
      include: { class: true, activity: true },
    });

    this.securityLogger.log("assignment_updated", {
      assignmentId: updated.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return updated;
  }
}

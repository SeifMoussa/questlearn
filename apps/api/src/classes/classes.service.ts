import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityLogger } from "../auth/security-logger.service";
import { generateJoinCode, joinCodeExpiry } from "./join-code.util";
import { CreateClassDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { AddRosterEntryDto } from "./dto/add-roster-entry.dto";

// A crypto-random 8-character code drawn from a 32-character alphabet
// has ~2^40 possibilities; a collision against existing rows is
// astronomically unlikely, but the column is globally unique so a
// retry loop is the correct defensive response rather than a crash.
const JOIN_CODE_MAX_ATTEMPTS = 5;

export interface TeacherContext {
  userId: string;
  tenantId: string;
}

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLogger,
  ) {}

  private async createUniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < JOIN_CODE_MAX_ATTEMPTS; attempt++) {
      const code = generateJoinCode();
      const existing = await this.prisma.class.findUnique({
        where: { joinCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new Error("Could not generate a unique join code after several attempts.");
  }

  async create(ctx: TeacherContext, dto: CreateClassDto) {
    const joinCode = await this.createUniqueJoinCode();
    const now = new Date();

    const created = await this.prisma.class.create({
      data: {
        tenantId: ctx.tenantId,
        teacherId: ctx.userId,
        name: dto.name.trim(),
        joinCode,
        joinCodeExpiresAt: joinCodeExpiry(now),
      },
    });

    this.securityLogger.log("class_created", {
      classId: created.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return created;
  }

  async findAllForTeacher(ctx: TeacherContext, includeArchived = false) {
    const where: Prisma.ClassWhereInput = {
      tenantId: ctx.tenantId,
      teacherId: ctx.userId,
      ...(includeArchived ? {} : { archivedAt: null }),
    };

    const classes = await this.prisma.class.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { roster: { where: { removedAt: null } } },
    });

    return classes;
  }

  /**
   * Scoped by tenant AND owning teacher, matching the forward-compatible
   * posture already established in the auth module — even though
   * one-teacher-per-tenant currently makes the two checks equivalent.
   * A class outside the caller's tenant/ownership 404s, never 403s, so
   * the response shape can't be used to confirm a class id exists.
   */
  private async findOwnedOrThrow(ctx: TeacherContext, classId: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenantId, teacherId: ctx.userId },
      include: { roster: { where: { removedAt: null }, orderBy: { addedAt: "asc" } } },
    });

    if (!cls) {
      throw new NotFoundException("Class not found.");
    }

    return cls;
  }

  async findOne(ctx: TeacherContext, classId: string) {
    return this.findOwnedOrThrow(ctx, classId);
  }

  async update(ctx: TeacherContext, classId: string, dto: UpdateClassDto) {
    await this.findOwnedOrThrow(ctx, classId);

    const data: Prisma.ClassUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.archived !== undefined) {
      data.archivedAt = dto.archived ? new Date() : null;
    }

    const updated = await this.prisma.class.update({
      where: { id: classId },
      data,
      include: { roster: { where: { removedAt: null }, orderBy: { addedAt: "asc" } } },
    });

    this.securityLogger.log(dto.archived ? "class_archived" : "class_updated", {
      classId: updated.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return updated;
  }

  async rotateJoinCode(ctx: TeacherContext, classId: string) {
    await this.findOwnedOrThrow(ctx, classId);

    const joinCode = await this.createUniqueJoinCode();
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { joinCode, joinCodeExpiresAt: joinCodeExpiry() },
      include: { roster: { where: { removedAt: null }, orderBy: { addedAt: "asc" } } },
    });

    this.securityLogger.log("join_code_rotated", {
      classId: updated.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return updated;
  }

  async addRosterEntry(ctx: TeacherContext, classId: string, dto: AddRosterEntryDto) {
    const cls = await this.findOwnedOrThrow(ctx, classId);

    const entry = await this.prisma.rosterEntry.create({
      data: {
        tenantId: ctx.tenantId,
        classId: cls.id,
        name: dto.name.trim(),
        email: dto.email?.trim().toLowerCase() || null,
      },
    });

    this.securityLogger.log("roster_entry_added", {
      classId: cls.id,
      rosterEntryId: entry.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return entry;
  }

  async removeRosterEntry(ctx: TeacherContext, classId: string, rosterId: string) {
    const cls = await this.findOwnedOrThrow(ctx, classId);

    const entry = await this.prisma.rosterEntry.findFirst({
      where: { id: rosterId, classId: cls.id, tenantId: ctx.tenantId, removedAt: null },
    });

    if (!entry) {
      throw new NotFoundException("Roster entry not found.");
    }

    const removed = await this.prisma.rosterEntry.update({
      where: { id: entry.id },
      data: { removedAt: new Date() },
    });

    this.securityLogger.log("roster_entry_removed", {
      classId: cls.id,
      rosterEntryId: removed.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return { message: "Roster entry removed." };
  }
}

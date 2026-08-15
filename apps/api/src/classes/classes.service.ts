import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityLogger } from "../auth/security-logger.service";
import { AuthService, ARGON2_OPTIONS, IssuedSession } from "../auth/auth.service";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { generateJoinCode, joinCodeExpiry, isJoinCodeExpired } from "./join-code.util";
import { CreateClassDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { AddRosterEntryDto } from "./dto/add-roster-entry.dto";
import { JoinClassDto } from "./dto/join-class.dto";

export interface JoinResult {
  kind: "session" | "enrolled";
  class: { id: string; name: string };
  rosterEntry: { id: string; name: string };
  session?: IssuedSession;
}

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
    private readonly authService: AuthService,
  ) {}

  /**
   * Redeems a join code. Two paths, per the Module 5 design decision:
   *
   *  - No valid learner access token presented: creates a brand-new
   *    `User{role: learner}` + `RosterEntry`, then immediately issues a
   *    session (same shape `/auth/login` returns) so redemption is one
   *    step, not register-then-login. Learners skip the email
   *    verification gate entirely — the join code itself, which is
   *    random, expiring, and rate-limited, is the trust proxy.
   *  - A valid learner access token IS presented: skips account
   *    creation, just links the existing learner to this class via a
   *    new `RosterEntry` ("join a second class"). A non-learner
   *    (teacher) token is treated the same as no token, since a
   *    teacher account joining as a learner doesn't make sense.
   *
   * Redeeming a code for a class the caller is already actively
   * enrolled in is a no-op that returns the existing enrollment, not
   * an error and not a duplicate row.
   */
  async redeemJoinCode(dto: JoinClassDto, existingLearner?: AccessTokenPayload): Promise<JoinResult> {
    const code = dto.joinCode.trim().toUpperCase();
    const cls = await this.prisma.class.findUnique({ where: { joinCode: code } });
    const now = new Date();

    // Generic "invalid or expired" for every failure mode (unknown
    // code, archived class, expired code) — mirrors the auth module's
    // "don't leak which specific thing was wrong" posture.
    if (!cls || cls.archivedAt || isJoinCodeExpired(cls.joinCodeExpiresAt, now)) {
      throw new NotFoundException("Invalid or expired join code.");
    }

    if (existingLearner?.role === "learner") {
      const existingEntry = await this.prisma.rosterEntry.findFirst({
        where: { classId: cls.id, userId: existingLearner.sub, removedAt: null },
      });
      if (existingEntry) {
        return {
          kind: "enrolled",
          class: { id: cls.id, name: cls.name },
          rosterEntry: { id: existingEntry.id, name: existingEntry.name },
        };
      }

      const learner = await this.prisma.user.findUniqueOrThrow({ where: { id: existingLearner.sub } });
      const entry = await this.prisma.rosterEntry.create({
        data: {
          tenantId: cls.tenantId,
          classId: cls.id,
          userId: learner.id,
          name: learner.name,
          email: learner.email,
        },
      });

      this.securityLogger.log("learner_joined_class", {
        classId: cls.id,
        tenantId: cls.tenantId,
        userId: learner.id,
        rosterEntryId: entry.id,
      });

      return { kind: "enrolled", class: { id: cls.id, name: cls.name }, rosterEntry: { id: entry.id, name: entry.name } };
    }

    // Anonymous path: register a brand-new learner account.
    if (!dto.name || !dto.email || !dto.password) {
      throw new BadRequestException("Name, email, and password are required to join a class.");
    }

    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException(
        "An account with this email already exists. Log in, then use this join code again.",
      );
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const { user, entry } = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenantId: cls.tenantId,
          email,
          name: dto.name!.trim(),
          passwordHash,
          role: "learner",
          emailVerifiedAt: new Date(),
        },
      });
      const newEntry = await tx.rosterEntry.create({
        data: {
          tenantId: cls.tenantId,
          classId: cls.id,
          userId: newUser.id,
          name: newUser.name,
          email: newUser.email,
        },
      });
      return { user: newUser, entry: newEntry };
    });

    this.securityLogger.log("learner_joined_class", {
      classId: cls.id,
      tenantId: cls.tenantId,
      userId: user.id,
      rosterEntryId: entry.id,
    });

    const session = await this.authService.issueSessionForUser(user.id, user.tenantId);

    return {
      kind: "session",
      class: { id: cls.id, name: cls.name },
      rosterEntry: { id: entry.id, name: entry.name },
      session,
    };
  }

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

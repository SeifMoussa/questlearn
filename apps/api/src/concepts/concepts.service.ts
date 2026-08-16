import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityLogger } from "../auth/security-logger.service";
import { CreateConceptDto } from "./dto/create-concept.dto";
import { UpdateConceptDto } from "./dto/update-concept.dto";

export interface TeacherContext {
  userId: string;
  tenantId: string;
}

@Injectable()
export class ConceptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLogger,
  ) {}

  async create(ctx: TeacherContext, dto: CreateConceptDto) {
    const created = await this.prisma.concept.create({
      data: {
        tenantId: ctx.tenantId,
        teacherId: ctx.userId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
      },
    });

    this.securityLogger.log("concept_created", {
      conceptId: created.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return created;
  }

  async findAllForTeacher(ctx: TeacherContext, includeArchived = false) {
    return this.prisma.concept.findMany({
      where: {
        tenantId: ctx.tenantId,
        teacherId: ctx.userId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Scoped by tenant AND owning teacher, matching every prior module's
   * posture. A concept outside the caller's tenant/ownership 404s,
   * never 403s.
   */
  private async findOwnedOrThrow(ctx: TeacherContext, conceptId: string) {
    const concept = await this.prisma.concept.findFirst({
      where: { id: conceptId, tenantId: ctx.tenantId, teacherId: ctx.userId },
    });
    if (!concept) {
      throw new NotFoundException("Concept not found.");
    }
    return concept;
  }

  async findOne(ctx: TeacherContext, conceptId: string) {
    return this.findOwnedOrThrow(ctx, conceptId);
  }

  async update(ctx: TeacherContext, conceptId: string, dto: UpdateConceptDto) {
    await this.findOwnedOrThrow(ctx, conceptId);

    const data: Prisma.ConceptUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.archived !== undefined) {
      data.archivedAt = dto.archived ? new Date() : null;
    }

    const updated = await this.prisma.concept.update({ where: { id: conceptId }, data });

    if (dto.archived) {
      this.securityLogger.log("concept_archived", {
        conceptId: updated.id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      });
    }

    return updated;
  }

  async archive(ctx: TeacherContext, conceptId: string) {
    await this.findOwnedOrThrow(ctx, conceptId);

    const updated = await this.prisma.concept.update({
      where: { id: conceptId },
      data: { archivedAt: new Date() },
    });

    this.securityLogger.log("concept_archived", {
      conceptId: updated.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return updated;
  }
}

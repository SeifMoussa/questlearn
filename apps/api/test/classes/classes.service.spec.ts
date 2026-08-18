import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ClassesService } from "../../src/classes/classes.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { SecurityLogger } from "../../src/auth/security-logger.service";

function joinCodeConflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`join_code`)", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["join_code"] },
  });
}

describe("ClassesService", () => {
  let service: ClassesService;
  let prisma: {
    class: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    rosterEntry: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  const ctx = { userId: "teacher-1", tenantId: "tenant-1" };

  beforeEach(() => {
    prisma = {
      class: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      rosterEntry: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new ClassesService(
      prisma as unknown as PrismaService,
      new SecurityLogger(),
      {} as never, // AuthService — unused by the paths under test here (see join.integration coverage)
    );
  });

  describe("create", () => {
    it("generates a unique join code and creates the class under the caller's tenant/teacher", async () => {
      prisma.class.findUnique.mockResolvedValueOnce(null); // code is free
      prisma.class.create.mockImplementationOnce(async ({ data }) => ({
        id: "class-1",
        ...data,
      }));

      const result = await service.create(ctx, { name: "  Period 3 Math  " });

      expect(prisma.class.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-1",
            teacherId: "teacher-1",
            name: "Period 3 Math",
          }),
        }),
      );
      expect(result.joinCode).toEqual(expect.any(String));
    });

    it("retries join-code generation on a collision until a free code is found", async () => {
      prisma.class.findUnique
        .mockResolvedValueOnce({ id: "existing" }) // first draw collides
        .mockResolvedValueOnce(null); // second draw is free
      prisma.class.create.mockImplementationOnce(async ({ data }) => ({
        id: "class-1",
        ...data,
      }));

      await service.create(ctx, { name: "Period 4 Science" });

      expect(prisma.class.findUnique).toHaveBeenCalledTimes(2);
    });

    it("gives up after repeated collisions rather than looping forever", async () => {
      prisma.class.findUnique.mockResolvedValue({ id: "existing" });

      await expect(service.create(ctx, { name: "Collision Class" })).rejects.toThrow();
    });

    it("retries with a freshly generated code if the WRITE itself loses a race on the join code (P2002)", async () => {
      // The findUnique check is optimistic, not atomic -- both draws
      // report the code as free, but the create() write only succeeds
      // the second time, proving the retry is driven by the DB's own
      // unique-constraint failure, not by the pre-check.
      prisma.class.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.class.create
        .mockRejectedValueOnce(joinCodeConflict())
        .mockImplementationOnce(async ({ data }) => ({ id: "class-1", ...data }));

      const result = await service.create(ctx, { name: "Race Class" });

      expect(prisma.class.create).toHaveBeenCalledTimes(2);
      expect(result.joinCode).toEqual(expect.any(String));
    });

    it("does not retry a non-P2002 error from the write", async () => {
      prisma.class.findUnique.mockResolvedValueOnce(null);
      prisma.class.create.mockRejectedValueOnce(new Error("connection reset"));

      await expect(service.create(ctx, { name: "Broken Class" })).rejects.toThrow("connection reset");
      expect(prisma.class.create).toHaveBeenCalledTimes(1);
    });

    it("gives up if the write keeps losing the race after repeated retries", async () => {
      prisma.class.findUnique.mockResolvedValue(null);
      prisma.class.create.mockRejectedValue(joinCodeConflict());

      await expect(service.create(ctx, { name: "Unlucky Class" })).rejects.toThrow();
    });
  });

  describe("findOne / ownership scoping", () => {
    it("404s when the class isn't found under the caller's tenant and teacher", async () => {
      prisma.class.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(ctx, "class-x")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.class.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "class-x", tenantId: "tenant-1", teacherId: "teacher-1" },
        }),
      );
    });

    it("returns the class with its active roster when owned", async () => {
      const cls = { id: "class-1", tenantId: "tenant-1", teacherId: "teacher-1", roster: [] };
      prisma.class.findFirst.mockResolvedValueOnce(cls);

      const result = await service.findOne(ctx, "class-1");
      expect(result).toBe(cls);
    });
  });

  describe("rotateJoinCode", () => {
    it("issues a new code and a fresh expiry, invalidating the old one", async () => {
      const existing = { id: "class-1", tenantId: "tenant-1", teacherId: "teacher-1", joinCode: "OLDCODE1" };
      prisma.class.findFirst.mockResolvedValueOnce(existing);
      prisma.class.findUnique.mockResolvedValueOnce(null); // new code is free

      let capturedData: { joinCode: string; joinCodeExpiresAt: Date } | undefined;
      prisma.class.update.mockImplementationOnce(async ({ data }) => {
        capturedData = data;
        return { ...existing, ...data };
      });

      const result = await service.rotateJoinCode(ctx, "class-1");

      expect(capturedData?.joinCode).not.toBe("OLDCODE1");
      expect(result.joinCode).not.toBe("OLDCODE1");
      expect(capturedData?.joinCodeExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("404s rotating a class outside the caller's tenant", async () => {
      prisma.class.findFirst.mockResolvedValueOnce(null);

      await expect(service.rotateJoinCode(ctx, "class-x")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.class.update).not.toHaveBeenCalled();
    });

    it("retries with a fresh code if the rotate write loses the same race", async () => {
      const existing = { id: "class-1", tenantId: "tenant-1", teacherId: "teacher-1", joinCode: "OLDCODE1" };
      prisma.class.findFirst.mockResolvedValueOnce(existing);
      prisma.class.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.class.update
        .mockRejectedValueOnce(joinCodeConflict())
        .mockImplementationOnce(async ({ data }) => ({ ...existing, ...data }));

      const result = await service.rotateJoinCode(ctx, "class-1");

      expect(prisma.class.update).toHaveBeenCalledTimes(2);
      expect(result.joinCode).not.toBe("OLDCODE1");
    });
  });

  describe("roster management", () => {
    const cls = { id: "class-1", tenantId: "tenant-1", teacherId: "teacher-1", roster: [] };

    it("adds a roster entry scoped to the class's tenant", async () => {
      prisma.class.findFirst.mockResolvedValueOnce(cls);
      prisma.rosterEntry.create.mockResolvedValueOnce({ id: "roster-1", name: "Sam Lee" });

      await service.addRosterEntry(ctx, "class-1", { name: "Sam Lee" });

      expect(prisma.rosterEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: "tenant-1", classId: "class-1", name: "Sam Lee" }),
        }),
      );
    });

    it("soft-deletes a roster entry by setting removedAt, not deleting the row", async () => {
      prisma.class.findFirst.mockResolvedValueOnce(cls);
      prisma.rosterEntry.findFirst.mockResolvedValueOnce({ id: "roster-1" });
      prisma.rosterEntry.update.mockResolvedValueOnce({ id: "roster-1", removedAt: new Date() });

      await service.removeRosterEntry(ctx, "class-1", "roster-1");

      expect(prisma.rosterEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "roster-1" },
          data: { removedAt: expect.any(Date) },
        }),
      );
    });

    it("404s removing an already-removed or nonexistent roster entry", async () => {
      prisma.class.findFirst.mockResolvedValueOnce(cls);
      prisma.rosterEntry.findFirst.mockResolvedValueOnce(null);

      await expect(service.removeRosterEntry(ctx, "class-1", "roster-x")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

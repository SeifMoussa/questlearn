import { ConflictException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { AuthService } from "../../src/auth/auth.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { EmailService } from "../../src/auth/email/email.service";
import { SecurityLogger } from "../../src/auth/security-logger.service";

const testEnv = {
  NODE_ENV: "test",
  PORT: 4000,
  DATABASE_URL: "postgres://user:pass@localhost:5432/questlearn",
  REDIS_URL: "redis://localhost:6379",
  CSRF_SECRET: "test-csrf-secret-value",
  JWT_SECRET: "test-jwt-secret-value",
};

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; create: jest.Mock; update: jest.Mock };
    tenant: { create: jest.Mock };
    session: { create: jest.Mock };
    verificationToken: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let emailService: { sendVerificationEmail: jest.Mock; sendPasswordResetEmail: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenant: { create: jest.fn() },
      session: { create: jest.fn() },
      verificationToken: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService(),
      emailService as unknown as EmailService,
      new SecurityLogger(),
      testEnv as never,
    );
  });

  describe("register", () => {
    it("hashes the password with argon2id and creates a tenant + user", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const createdUser = {
        id: "user-1",
        tenantId: "tenant-1",
        email: "teacher@example.com",
        name: "Ada Lovelace",
      };
      prisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn({
          tenant: { create: jest.fn().mockResolvedValue({ id: "tenant-1", name: "Ada Lovelace's Workspace" }) },
          user: { create: jest.fn().mockResolvedValue(createdUser) },
        }),
      );
      prisma.verificationToken.create.mockResolvedValueOnce({});

      const result = await service.register({
        email: "Teacher@Example.com",
        password: "correcthorse123",
        name: "Ada Lovelace",
      });

      expect(result.message).toMatch(/verify/i);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "teacher@example.com" },
      });
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "teacher@example.com" }),
      );
    });

    it("rejects duplicate emails without hashing or creating anything", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: "existing" });

      await expect(
        service.register({
          email: "teacher@example.com",
          password: "correcthorse123",
          name: "Ada Lovelace",
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("never stores the plaintext password", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      let capturedHash = "";
      prisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn({
          tenant: { create: jest.fn().mockResolvedValue({ id: "tenant-1" }) },
          user: {
            create: jest.fn().mockImplementation(async ({ data }: { data: { passwordHash: string } }) => {
              capturedHash = data.passwordHash;
              return { id: "user-1", tenantId: "tenant-1", email: "teacher@example.com", name: "Ada" };
            }),
          },
        }),
      );
      prisma.verificationToken.create.mockResolvedValueOnce({});

      await service.register({
        email: "teacher@example.com",
        password: "correcthorse123",
        name: "Ada",
      });

      expect(capturedHash).not.toBe("correcthorse123");
      expect(await argon2.verify(capturedHash, "correcthorse123")).toBe(true);
    });
  });

  describe("login", () => {
    async function makeUser(overrides: Record<string, unknown> = {}) {
      return {
        id: "user-1",
        tenantId: "tenant-1",
        email: "teacher@example.com",
        name: "Ada",
        role: "teacher",
        passwordHash: await argon2.hash("correcthorse123", { type: argon2.argon2id }),
        emailVerifiedAt: new Date(),
        ...overrides,
      };
    }

    it("issues tokens for correct credentials on a verified account", async () => {
      const user = await makeUser();
      prisma.user.findUnique.mockResolvedValueOnce(user);
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      prisma.session.create.mockResolvedValueOnce({});

      const result = await service.login({
        email: "teacher@example.com",
        password: "correcthorse123",
      });

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user.email).toBe("teacher@example.com");
    });

    it("returns a distinct error for an unverified account", async () => {
      const user = await makeUser({ emailVerifiedAt: null });
      prisma.user.findUnique.mockResolvedValueOnce(user);

      await expect(
        service.login({ email: "teacher@example.com", password: "correcthorse123" }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("returns the exact same generic error for a wrong password and a nonexistent email", async () => {
      const user = await makeUser();
      prisma.user.findUnique.mockResolvedValueOnce(user);
      let wrongPasswordError = "";
      try {
        await service.login({ email: "teacher@example.com", password: "wrong-password" });
      } catch (error) {
        wrongPasswordError = (error as Error).message;
      }

      prisma.user.findUnique.mockResolvedValueOnce(null);
      let noAccountError = "";
      try {
        await service.login({ email: "nobody@example.com", password: "whatever123" });
      } catch (error) {
        noAccountError = (error as Error).message;
      }

      expect(wrongPasswordError).toBe(noAccountError);
      expect(wrongPasswordError.toLowerCase()).not.toContain("exist");
    });

    it("rejects a wrong password with UnauthorizedException", async () => {
      const user = await makeUser();
      prisma.user.findUnique.mockResolvedValueOnce(user);

      await expect(
        service.login({ email: "teacher@example.com", password: "wrong-password" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});

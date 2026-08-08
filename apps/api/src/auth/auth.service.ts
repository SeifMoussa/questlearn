import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { Env } from "@questlearn/config";
import { ENV } from "../config/env.module";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email/email.service";
import { SecurityLogger } from "./security-logger.service";
import { generateToken, hashToken } from "./token.util";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const VERIFICATION_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// OWASP-recommended minimum argon2id parameters.
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const UNVERIFIED_LOGIN_ERROR =
  "Please verify your email before logging in.";

export interface AccessTokenResult {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
  };
}

export interface IssuedSession extends AccessTokenResult {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly securityLogger: SecurityLogger,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Same generic shape whether or not the account exists to
      // avoid confirming account existence via a distinct error —
      // but registration specifically needs to block duplicates, so
      // this one case is allowed to say so (it's the create path,
      // not the login/enumeration path).
      throw new ConflictException("An account with this email already exists.");
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const { user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: `${dto.name}'s Workspace` },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          name: dto.name,
          passwordHash,
          role: "teacher",
        },
      });
      return { tenant, user };
    });

    await this.issueVerificationToken(user.id, user.tenantId, user.email);

    this.securityLogger.log("register", {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
    });

    return {
      message: "Account created. Check your email to verify your account.",
    };
  }

  private async issueVerificationToken(
    userId: string,
    tenantId: string,
    email: string,
  ): Promise<void> {
    const token = generateToken();
    await this.prisma.verificationToken.create({
      data: {
        tenantId,
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });
    await this.emailService.sendVerificationEmail({ to: email, token });
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const tokenHash = hashToken(token);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        "This verification link is invalid or has expired.",
      );
    }

    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    this.securityLogger.log("email_verified", { userId: record.userId });

    return { message: "Email verified. You can now log in." };
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      this.securityLogger.log("login_failure", { email, reason: "no_account" });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      this.securityLogger.log("login_failure", {
        userId: user.id,
        reason: "bad_password",
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (!user.emailVerifiedAt) {
      this.securityLogger.log("login_failure", {
        userId: user.id,
        reason: "unverified",
      });
      throw new ForbiddenException(UNVERIFIED_LOGIN_ERROR);
    }

    const session = await this.issueSession(user.id, user.tenantId);

    this.securityLogger.log("login_success", {
      userId: user.id,
      tenantId: user.tenantId,
    });

    return {
      ...session,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  private async issueSession(
    userId: string,
    tenantId: string,
  ): Promise<AccessTokenResult & { refreshToken: string; refreshTokenExpiresAt: Date }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role },
      { secret: this.env.JWT_SECRET, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    const refreshToken = generateToken();
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.session.create({
      data: {
        tenantId,
        userId,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token.");
    }

    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }

    // Rotate: revoke the presented token and issue a brand new one so
    // reuse of a stolen/stale refresh token is a dead end.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const next = await this.issueSession(session.userId, session.tenantId);

    this.securityLogger.log("token_refreshed", {
      userId: session.userId,
      tenantId: session.tenantId,
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });

    return {
      ...next,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async logout(refreshToken: string | undefined): Promise<{ message: string }> {
    if (!refreshToken) {
      return { message: "Logged out." };
    }

    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
    });

    if (session && !session.revokedAt) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      this.securityLogger.log("logout", {
        userId: session.userId,
        tenantId: session.tenantId,
      });
    }

    return { message: "Logged out." };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });

    // Always return the same generic response, whether or not the
    // account exists, so this endpoint can't be used to enumerate
    // registered emails.
    const genericResponse = {
      message:
        "If an account with that email exists, a password reset link has been sent.",
    };

    if (!user) {
      return genericResponse;
    }

    const token = generateToken();
    await this.prisma.passwordResetToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await this.emailService.sendPasswordResetEmail({ to: user.email, token });

    this.securityLogger.log("password_reset_requested", { userId: user.id });

    return genericResponse;
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        "This password reset link is invalid or has expired.",
      );
    }

    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      // Resetting a password invalidates every existing session —
      // a leaked/stolen refresh token from before the reset should
      // stop working immediately.
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.securityLogger.log("password_reset_completed", {
      userId: record.userId,
    });

    return { message: "Password updated. You can now log in." };
  }
}

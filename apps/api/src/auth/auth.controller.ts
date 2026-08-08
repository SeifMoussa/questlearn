import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { Env } from "@questlearn/config";
import { ENV } from "../config/env.module";
import { AuthService, IssuedSession } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { issueCsrfToken } from "./csrf.util";
import { CsrfGuard } from "./guards/csrf.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AccessTokenPayload } from "./guards/jwt-auth.guard";

const REFRESH_COOKIE = "refresh_token";
const CSRF_COOKIE = "csrf_token";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private setSessionCookies(res: Response, session: IssuedSession): void {
    const secure = this.env.NODE_ENV === "production";

    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      expires: session.refreshTokenExpiresAt,
    });

    res.cookie(CSRF_COOKIE, issueCsrfToken(this.env.CSRF_SECRET), {
      httpOnly: false,
      secure,
      sameSite: "lax",
      path: "/",
      expires: session.refreshTokenExpiresAt,
    });
  }

  private clearSessionCookies(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    res.clearCookie(CSRF_COOKIE, { path: "/" });
  }

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Create a teacher account and its workspace" })
  async register(@Body() dto: RegisterDto): Promise<{ message: string }> {
    return this.authService.register(dto);
  }

  @Post("verify-email")
  @ApiOperation({ summary: "Verify an account's email with a one-time token" })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    return this.authService.verifyEmail(dto.token);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Log in and receive an access token" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(dto);
    this.setSessionCookies(res, session);
    const { refreshToken: _refreshToken, refreshTokenExpiresAt: _refreshTokenExpiresAt, ...body } = session;
    return body;
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Request a password reset link" })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset a password with a one-time token" })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: "Rotate the refresh token and issue a new access token" })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.refresh(req.cookies?.[REFRESH_COOKIE]);
    this.setSessionCookies(res, session);
    const { refreshToken: _refreshToken, refreshTokenExpiresAt: _refreshTokenExpiresAt, ...body } = session;
    return body;
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: "Revoke the current session" })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const result = await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearSessionCookies(res);
    return result;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Return the authenticated user (protected route)" })
  me(@CurrentUser() user: AccessTokenPayload): AccessTokenPayload {
    return user;
  }
}

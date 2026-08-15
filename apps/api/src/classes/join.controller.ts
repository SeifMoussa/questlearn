import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { Env } from "@questlearn/config";
import { ENV } from "../config/env.module";
import { issueCsrfToken } from "../auth/csrf.util";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { ClassesService } from "./classes.service";
import { JoinClassDto } from "./dto/join-class.dto";

const REFRESH_COOKIE = "refresh_token";
const CSRF_COOKIE = "csrf_token";

// Same rate-limiting treatment as /auth/login (Module 5 decision):
// join-code redemption is a public, unauthenticated endpoint and a
// prime brute-force target (an 8-character code), so it shares the
// exact throttle env vars/defaults auth endpoints already use.
const JOIN_THROTTLE = {
  default: {
    limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 5),
    ttl: Number(process.env.AUTH_THROTTLE_TTL_MS ?? 60_000),
  },
};

/**
 * Deliberately a separate controller (not folded into
 * `ClassesController`, which applies `JwtAuthGuard` at the class
 * level) because this route must be callable with no access token at
 * all — the join code itself is the credential. When a Bearer token
 * IS present, it's optionally decoded (not enforced via a guard) so
 * an already-logged-in learner can join a second class in one call.
 */
@ApiTags("classes")
@Controller("classes")
export class JoinController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly jwtService: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async decodeOptionalLearner(req: Request): Promise<AccessTokenPayload | undefined> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return undefined;
    const token = authHeader.slice("Bearer ".length);
    try {
      return await this.jwtService.verifyAsync<AccessTokenPayload>(token, { secret: this.env.JWT_SECRET });
    } catch {
      // An invalid/expired token is treated the same as no token at
      // all — this endpoint never rejects on auth failure, it just
      // falls back to the "no valid access token present" path.
      return undefined;
    }
  }

  @Post("join")
  @HttpCode(HttpStatus.OK)
  @Throttle(JOIN_THROTTLE)
  @ApiOperation({ summary: "Redeem a class join code (registers a learner or links an existing one)" })
  async join(
    @Body() dto: JoinClassDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const existingLearner = await this.decodeOptionalLearner(req);
    const result = await this.classesService.redeemJoinCode(dto, existingLearner);

    if (result.kind === "session" && result.session) {
      const secure = this.env.NODE_ENV === "production";
      res.cookie(REFRESH_COOKIE, result.session.refreshToken, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        expires: result.session.refreshTokenExpiresAt,
      });
      res.cookie(CSRF_COOKIE, issueCsrfToken(this.env.CSRF_SECRET), {
        httpOnly: false,
        secure,
        sameSite: "lax",
        path: "/",
        expires: result.session.refreshTokenExpiresAt,
      });

      const { refreshToken: _refreshToken, refreshTokenExpiresAt: _refreshTokenExpiresAt, ...sessionBody } =
        result.session;
      return { ...sessionBody, class: result.class, rosterEntry: result.rosterEntry };
    }

    return { class: result.class, rosterEntry: result.rosterEntry };
  }
}

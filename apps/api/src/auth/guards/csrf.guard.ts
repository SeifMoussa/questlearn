import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";
import { Env } from "@questlearn/config";
import { ENV } from "../../config/env.module";
import { verifyCsrfToken } from "../csrf.util";

/**
 * Double-submit CSRF check for the cookie-authenticated endpoints
 * (refresh, logout). The access-token-bearing endpoints don't need
 * this: a cross-site request can't attach an `Authorization` header,
 * only cookies ride along automatically.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookieToken = request.cookies?.["csrf_token"];
    const headerToken = request.headers["x-csrf-token"];

    if (
      typeof cookieToken !== "string" ||
      typeof headerToken !== "string" ||
      cookieToken !== headerToken ||
      !verifyCsrfToken(this.env.CSRF_SECRET, cookieToken)
    ) {
      throw new ForbiddenException("Invalid or missing CSRF token.");
    }

    return true;
  }
}

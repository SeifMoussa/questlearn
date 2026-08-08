import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { Env } from "@questlearn/config";
import { ENV } from "../../config/env.module";

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing access token.");
    }

    const token = authHeader.slice("Bearer ".length);

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: this.env.JWT_SECRET },
      );
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token.");
    }
  }
}

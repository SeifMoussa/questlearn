import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { AccessTokenPayload, AuthenticatedRequest } from "../guards/jwt-auth.guard";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

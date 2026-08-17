import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { GamificationService } from "./gamification.service";

@ApiTags("gamification")
@Controller()
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get("gamification/profile")
  @ApiOperation({ summary: "The caller's own XP total, level progress, and earned badges" })
  getMyProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.gamificationService.getProfile({ userId: user.sub, tenantId: user.tenantId });
  }
}

import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { MasteryService } from "./mastery.service";

@ApiTags("mastery")
@Controller()
@UseGuards(JwtAuthGuard)
export class MasteryController {
  constructor(private readonly masteryService: MasteryService) {}

  @Get("mastery/me")
  @ApiOperation({ summary: "The caller's own live-computed mastery, one row per concept with any evidence" })
  getMine(@CurrentUser() user: AccessTokenPayload, @Query("conceptIds") conceptIds?: string) {
    const ids = conceptIds ? conceptIds.split(",").filter(Boolean) : undefined;
    return this.masteryService.getMasteryForLearner({ userId: user.sub, tenantId: user.tenantId }, ids);
  }

  @Get("classes/:id/mastery")
  @ApiOperation({ summary: "Teacher class-mastery aggregate: every active roster learner x every concept with evidence" })
  getForClass(@CurrentUser() user: AccessTokenPayload, @Param("id") classId: string) {
    return this.masteryService.getMasteryForClass({ userId: user.sub, tenantId: user.tenantId }, classId);
  }
}

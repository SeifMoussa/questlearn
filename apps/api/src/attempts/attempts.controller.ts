import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { AttemptsService, LearnerContext } from "./attempts.service";
import { AutosaveResponseDto } from "./dto/autosave-response.dto";

function contextOf(user: AccessTokenPayload): LearnerContext {
  return { userId: user.sub, tenantId: user.tenantId };
}

@ApiTags("attempts")
@Controller()
@UseGuards(JwtAuthGuard)
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Post("assignments/:id/attempts/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start (or resume) the caller's attempt at an assignment" })
  start(@CurrentUser() user: AccessTokenPayload, @Param("id") assignmentId: string) {
    return this.attemptsService.start(contextOf(user), assignmentId);
  }

  @Get("attempts/:id")
  @ApiOperation({ summary: "Get an attempt's resolved question content (answer key stripped pre-submit)" })
  findOne(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.attemptsService.getOne(contextOf(user), id);
  }

  @Patch("attempts/:id/responses/:activityQuestionId")
  @ApiOperation({ summary: "Autosave a single question's response on an in-progress attempt" })
  autosave(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Param("activityQuestionId") activityQuestionId: string,
    @Body() dto: AutosaveResponseDto,
  ) {
    return this.attemptsService.autosaveResponse(contextOf(user), id, activityQuestionId, dto);
  }

  @Post("attempts/:id/submit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Submit and grade an attempt (idempotent — safe to call more than once)" })
  submit(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.attemptsService.submit(contextOf(user), id);
  }
}

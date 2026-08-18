import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { QuestsService } from "./quests.service";
import { CreateQuestDto, QuestStepGateDto, ReorderQuestStepsDto, UpdateQuestDto } from "./dto/quest.dto";

function contextOf(user: AccessTokenPayload) {
  return { userId: user.sub, tenantId: user.tenantId };
}

@ApiTags("quests")
@Controller("quests")
@UseGuards(JwtAuthGuard)
export class QuestsController {
  constructor(private readonly questsService: QuestsService) {}

  @Post()
  @ApiOperation({ summary: "Create a quest owned by the current teacher" })
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateQuestDto) {
    return this.questsService.create(contextOf(user), dto);
  }

  @Get()
  @ApiOperation({ summary: "List quests: the caller's own (teacher) or every tenant-wide quest (learner)" })
  findAll(@CurrentUser() user: AccessTokenPayload) {
    if (user.role === "learner") {
      return this.questsService.findAllForLearner(contextOf(user));
    }
    return this.questsService.findAllForTeacher(contextOf(user));
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a quest's detail: step config (teacher) or live progress (learner)" })
  findOne(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    if (user.role === "learner") {
      return this.questsService.getProgress(contextOf(user), id);
    }
    return this.questsService.findOneForTeacher(contextOf(user), id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Rename/redescribe a quest" })
  update(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string, @Body() dto: UpdateQuestDto) {
    return this.questsService.update(contextOf(user), id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Archive a quest" })
  archive(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.questsService.archive(contextOf(user), id);
  }

  @Post(":id/steps")
  @ApiOperation({ summary: "Add a step gated on an activity, a mastery threshold, or both" })
  addStep(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string, @Body() dto: QuestStepGateDto) {
    return this.questsService.addStep(contextOf(user), id, dto);
  }

  @Patch(":id/steps/:stepId")
  @ApiOperation({ summary: "Replace a step's gate configuration" })
  updateStep(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Param("stepId") stepId: string,
    @Body() dto: QuestStepGateDto,
  ) {
    return this.questsService.updateStep(contextOf(user), id, stepId, dto);
  }

  @Delete(":id/steps/:stepId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a step" })
  removeStep(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string, @Param("stepId") stepId: string) {
    return this.questsService.removeStep(contextOf(user), id, stepId);
  }

  @Patch(":id/steps/reorder")
  @ApiOperation({ summary: "Reorder a quest's steps" })
  reorder(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string, @Body() dto: ReorderQuestStepsDto) {
    return this.questsService.reorderSteps(contextOf(user), id, dto);
  }
}

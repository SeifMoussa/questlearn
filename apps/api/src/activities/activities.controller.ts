import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { ActivitiesService, TeacherContext } from "./activities.service";
import { AddActivityQuestionDto, CreateActivityDto, ReorderActivityQuestionsDto, UpdateActivityDto } from "./dto/activity.dto";

function contextOf(user: AccessTokenPayload): TeacherContext {
  return { userId: user.sub, tenantId: user.tenantId };
}

@ApiTags("activities")
@Controller("activities")
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @ApiOperation({ summary: "Create a draft activity owned by the current teacher" })
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(contextOf(user), dto);
  }

  @Get()
  @ApiOperation({ summary: "List the current teacher's activities (excludes archived)" })
  findAll(@CurrentUser() user: AccessTokenPayload) {
    return this.activitiesService.findAllForTeacher(contextOf(user));
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an activity's detail with resolved question content" })
  findOne(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.activitiesService.findOne(contextOf(user), id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Rename a draft activity" })
  update(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string, @Body() dto: UpdateActivityDto) {
    return this.activitiesService.update(contextOf(user), id, dto);
  }

  @Post(":id/questions")
  @ApiOperation({ summary: "Append a question to a draft activity" })
  addQuestion(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body() dto: AddActivityQuestionDto,
  ) {
    return this.activitiesService.addQuestion(contextOf(user), id, dto);
  }

  @Delete(":id/questions/:activityQuestionId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a question from a draft activity" })
  removeQuestion(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Param("activityQuestionId") activityQuestionId: string,
  ) {
    return this.activitiesService.removeQuestion(contextOf(user), id, activityQuestionId);
  }

  @Patch(":id/questions/reorder")
  @ApiOperation({ summary: "Reorder a draft activity's questions" })
  reorder(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body() dto: ReorderActivityQuestionsDto,
  ) {
    return this.activitiesService.reorder(contextOf(user), id, dto);
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Publish an activity, pinning every question's exact current version" })
  publish(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.activitiesService.publish(contextOf(user), id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Archive an activity (allowed in any status)" })
  archive(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.activitiesService.archive(contextOf(user), id);
  }
}

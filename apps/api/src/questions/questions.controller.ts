import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { QuestionsService, TeacherContext } from "./questions.service";
import { CreateQuestionDto, UpdateQuestionDto } from "./dto/question-payload.dto";

function contextOf(user: AccessTokenPayload): TeacherContext {
  return { userId: user.sub, tenantId: user.tenantId };
}

@ApiTags("questions")
@Controller("questions")
@UseGuards(JwtAuthGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @ApiOperation({ summary: "Create a question (v1) owned by the current teacher" })
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateQuestionDto) {
    return this.questionsService.create(contextOf(user), dto);
  }

  @Get()
  @ApiOperation({ summary: "List the current teacher's questions (excludes archived)" })
  findAll(@CurrentUser() user: AccessTokenPayload) {
    return this.questionsService.findAllForTeacher(contextOf(user));
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a question's current version, including its answer key" })
  findOne(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.questionsService.findOne(contextOf(user), id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit a question — always creates a new version" })
  update(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionsService.update(contextOf(user), id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Archive a question" })
  archive(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.questionsService.archive(contextOf(user), id);
  }
}

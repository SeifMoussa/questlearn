import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { AssignmentsService, TeacherContext } from "./assignments.service";
import { CreateAssignmentDto, UpdateAssignmentDto } from "./dto/assignment.dto";

function contextOf(user: AccessTokenPayload): TeacherContext {
  return { userId: user.sub, tenantId: user.tenantId };
}

@ApiTags("assignments")
@Controller("assignments")
@UseGuards(JwtAuthGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @ApiOperation({ summary: "Assign a published activity to a class with a due date" })
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateAssignmentDto) {
    return this.assignmentsService.create(contextOf(user), dto);
  }

  @Get()
  @ApiOperation({ summary: "List the current teacher's assignments, optionally filtered by class or activity" })
  findAll(
    @CurrentUser() user: AccessTokenPayload,
    @Query("classId") classId?: string,
    @Query("activityId") activityId?: string,
  ) {
    return this.assignmentsService.findAllForTeacher(contextOf(user), { classId, activityId });
  }

  @Get("mine")
  @ApiOperation({ summary: "List the current learner's assignments across every class they're enrolled in" })
  findMine(@CurrentUser() user: AccessTokenPayload) {
    return this.assignmentsService.findAllForLearner(contextOf(user));
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an assignment's detail" })
  findOne(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.assignmentsService.findOne(contextOf(user), id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Reschedule an assignment's due date" })
  update(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string, @Body() dto: UpdateAssignmentDto) {
    return this.assignmentsService.update(contextOf(user), id, dto);
  }
}

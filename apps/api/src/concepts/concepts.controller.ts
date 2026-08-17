import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { ConceptsService, TeacherContext } from "./concepts.service";
import { CreateConceptDto } from "./dto/create-concept.dto";
import { UpdateConceptDto } from "./dto/update-concept.dto";

function contextOf(user: AccessTokenPayload): TeacherContext {
  return { userId: user.sub, tenantId: user.tenantId };
}

@ApiTags("concepts")
@Controller("concepts")
@UseGuards(JwtAuthGuard)
export class ConceptsController {
  constructor(private readonly conceptsService: ConceptsService) {}

  @Post()
  @ApiOperation({ summary: "Create a mastery concept owned by the current teacher" })
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateConceptDto) {
    return this.conceptsService.create(contextOf(user), dto);
  }

  @Get()
  @ApiOperation({ summary: "List the current teacher's concepts (excludes archived)" })
  findAll(@CurrentUser() user: AccessTokenPayload) {
    return this.conceptsService.findAllForTeacher(contextOf(user));
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single concept" })
  findOne(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.conceptsService.findOne(contextOf(user), id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Rename, redescribe, and/or archive a concept" })
  update(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string, @Body() dto: UpdateConceptDto) {
    return this.conceptsService.update(contextOf(user), id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Archive a concept" })
  archive(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.conceptsService.archive(contextOf(user), id);
  }
}

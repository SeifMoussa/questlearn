import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { ClassesService, TeacherContext } from "./classes.service";
import { CreateClassDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { AddRosterEntryDto } from "./dto/add-roster-entry.dto";

function contextOf(user: AccessTokenPayload): TeacherContext {
  return { userId: user.sub, tenantId: user.tenantId };
}

@ApiTags("classes")
@Controller("classes")
@UseGuards(JwtAuthGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @ApiOperation({ summary: "Create a class owned by the current teacher" })
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateClassDto) {
    return this.classesService.create(contextOf(user), dto);
  }

  @Get()
  @ApiOperation({ summary: "List the current teacher's classes (excludes archived)" })
  findAll(@CurrentUser() user: AccessTokenPayload) {
    return this.classesService.findAllForTeacher(contextOf(user));
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a class's detail, roster, and join code" })
  findOne(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.classesService.findOne(contextOf(user), id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Rename and/or archive a class" })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classesService.update(contextOf(user), id, dto);
  }

  @Post(":id/join-code/rotate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate a class's join code, invalidating the old one" })
  rotateJoinCode(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.classesService.rotateJoinCode(contextOf(user), id);
  }

  @Post(":id/roster")
  @ApiOperation({ summary: "Add a roster entry to a class" })
  addRosterEntry(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body() dto: AddRosterEntryDto,
  ) {
    return this.classesService.addRosterEntry(contextOf(user), id, dto);
  }

  @Delete(":id/roster/:rosterId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Soft-delete a roster entry" })
  removeRosterEntry(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Param("rosterId") rosterId: string,
  ) {
    return this.classesService.removeRosterEntry(contextOf(user), id, rosterId);
  }
}

import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenPayload } from "../auth/guards/jwt-auth.guard";
import { ReportsService } from "./reports.service";

function contextOf(user: AccessTokenPayload) {
  return { userId: user.sub, tenantId: user.tenantId };
}

@ApiTags("reports")
@Controller()
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("classes/:id/report")
  @ApiOperation({ summary: "Teacher dashboard: per-assignment completion/average score plus a class-wide mastery summary" })
  getClassReport(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.reportsService.getClassReport(contextOf(user), id);
  }

  @Get("classes/:id/report/csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="class-report.csv"')
  @ApiOperation({ summary: "CSV export of the class dashboard's per-assignment completion/average score table" })
  getClassReportCsv(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.reportsService.getClassReportCsv(contextOf(user), id);
  }

  @Get("activities/:id/report")
  @ApiOperation({ summary: "Question analysis: per-question correct rate, average points, and hint-view rate across every submitted response" })
  getActivityReport(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.reportsService.getActivityReport(contextOf(user), id);
  }

  @Get("classes/:classId/learners/:learnerId/report")
  @ApiOperation({ summary: "Learner report: attempt history, mastery, gamification profile, and quest progress" })
  getLearnerReport(
    @CurrentUser() user: AccessTokenPayload,
    @Param("classId") classId: string,
    @Param("learnerId") learnerId: string,
  ) {
    return this.reportsService.getLearnerReport(contextOf(user), classId, learnerId);
  }
}

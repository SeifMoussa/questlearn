import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthReport, HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: "Report API, database, and Redis connectivity status",
  })
  @ApiOkResponse({
    description: "Real-time connectivity report for the API and its dependencies.",
  })
  async check(): Promise<HealthReport> {
    return this.healthService.getReport();
  }
}

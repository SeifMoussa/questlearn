import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { MasteryModule } from "../mastery/mastery.module";
import { GamificationModule } from "../gamification/gamification.module";
import { QuestsModule } from "../quests/quests.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/**
 * Reuses MasteryService/GamificationService/QuestsService's existing
 * public read methods for the learner report rather than re-deriving
 * mastery/XP/quest state — the same "later module composes earlier
 * module's service" pattern GamificationModule and QuestsModule
 * already established.
 */
@Module({
  imports: [JwtModule.register({}), AuthModule, MasteryModule, GamificationModule, QuestsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { MasteryModule } from "../mastery/mastery.module";
import { QuestsController } from "./quests.controller";
import { QuestsService } from "./quests.service";

/**
 * Mirrors `GamificationModule`: `QuestsService` is consumed both by
 * `AttemptsModule` (calling `evaluateQuestProgressForAttempt` from
 * inside the submit transaction) and by this module's own controller.
 * Exporting `QuestsService` lets `AttemptsModule` import this module
 * rather than duplicating the completion logic.
 */
@Module({
  imports: [JwtModule.register({}), AuthModule, MasteryModule],
  controllers: [QuestsController],
  providers: [QuestsService],
  exports: [QuestsService],
})
export class QuestsModule {}

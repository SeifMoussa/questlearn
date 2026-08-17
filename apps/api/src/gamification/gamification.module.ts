import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { MasteryModule } from "../mastery/mastery.module";
import { GamificationController } from "./gamification.controller";
import { GamificationService } from "./gamification.service";

/**
 * Lives as its own top-level module, mirroring `MasteryModule`:
 * `GamificationService` is consumed both by `AttemptsModule` (calling
 * `awardForAttempt` from inside the submit transaction) and by this
 * module's own controller serving the learner-facing read endpoint.
 * Exporting `GamificationService` lets `AttemptsModule` import this
 * module rather than duplicating the award logic.
 */
@Module({
  imports: [JwtModule.register({}), AuthModule, MasteryModule],
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}

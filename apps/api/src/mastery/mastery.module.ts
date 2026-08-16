import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { MasteryController } from "./mastery.controller";
import { MasteryService } from "./mastery.service";

/**
 * Lives as its own top-level module (not folded into `attempts` or
 * `classes`) since `MasteryService` is consumed by both: `attempts`
 * calls `recordEvidenceForAttempt` from inside the submit
 * transaction, and this module's own controller serves the
 * learner/teacher read endpoints. Exporting `MasteryService` lets
 * `AttemptsModule` import this module rather than duplicating the
 * evidence-recording logic.
 */
@Module({
  imports: [JwtModule.register({}), AuthModule],
  controllers: [MasteryController],
  providers: [MasteryService],
  exports: [MasteryService],
})
export class MasteryModule {}

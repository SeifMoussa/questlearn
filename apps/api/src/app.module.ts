import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { EnvModule } from "./config/env.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { ClassesModule } from "./classes/classes.module";
import { QuestionsModule } from "./questions/questions.module";
import { ActivitiesModule } from "./activities/activities.module";
import { AssignmentsModule } from "./assignments/assignments.module";
import { AttemptsModule } from "./attempts/attempts.module";
import { ConceptsModule } from "./concepts/concepts.module";
import { MasteryModule } from "./mastery/mastery.module";
import { GamificationModule } from "./gamification/gamification.module";
import { QuestsModule } from "./quests/quests.module";
import { ReportsModule } from "./reports/reports.module";

// Decorator/module arguments are evaluated once, at module load --
// read straight from process.env (with the same defaults as the
// shared env schema) rather than through Nest DI, mirroring
// auth.controller.ts's AUTH_THROTTLE pattern for the identical reason:
// this runs before any injector exists. Deliberately NOT a hardcoded
// literal -- bumping the number directly here would have loosened the
// limit in production too, not just test/dev.
const GLOBAL_THROTTLE = {
  ttl: Number(process.env.GLOBAL_THROTTLE_TTL_MS ?? 60_000),
  limit: Number(process.env.GLOBAL_THROTTLE_LIMIT ?? 100),
};

@Module({
  imports: [
    EnvModule,
    // Applies to every endpoint without its own @Throttle override --
    // notably /auth/refresh (never overridden; see auth.controller.ts)
    // plus every plain GET read across the app. Reproduced, with
    // Redis's throttle state freshly flushed (not cross-run bleed), a
    // 429 on /auth/refresh partway through a single clean Playwright
    // suite run -- the growing suite's page-load/API-call volume, not
    // AUTH_THROTTLE_LIMIT (which only covers register/login/forgot-
    // password/join, and does not cover refresh at all), was the
    // actual bottleneck.
    ThrottlerModule.forRoot({
      throttlers: [GLOBAL_THROTTLE],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ClassesModule,
    QuestionsModule,
    ActivitiesModule,
    AssignmentsModule,
    AttemptsModule,
    ConceptsModule,
    MasteryModule,
    GamificationModule,
    QuestsModule,
    ReportsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

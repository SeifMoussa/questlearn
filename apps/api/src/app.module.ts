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

@Module({
  imports: [
    EnvModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

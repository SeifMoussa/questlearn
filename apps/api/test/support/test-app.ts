import cookieParser from "cookie-parser";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { createValidationPipe } from "../../src/common/validation-pipe";

/**
 * Builds a real, fully-wired Nest application (real Postgres via
 * PrismaService, real Redis-free in-memory throttler storage) the
 * same way main.ts does, for integration tests to drive over HTTP
 * with supertest instead of importing services directly.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());
  await app.init();
  return app;
}

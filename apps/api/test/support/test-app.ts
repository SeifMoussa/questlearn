import cookieParser from "cookie-parser";
import { ValidationPipe, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";

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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

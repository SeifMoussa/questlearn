import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { EnvValidationError, loadEnv } from "@questlearn/config";
import { AppModule } from "./app.module";
import { createValidationPipe } from "./common/validation-pipe";

async function bootstrap(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: env.WEB_URL,
    credentials: true,
  });

  // Baseline security headers (X-Content-Type-Options, X-Frame-Options,
  // HSTS, a default-deny CSP) for every response. This API serves no
  // application HTML of its own -- everything but Swagger UI is JSON --
  // so a fully closed policy (no script/style/font sources at all) is
  // correct here. `useDefaults: false` because helmet's built-in
  // defaults include `style-src 'unsafe-inline'`, which is a
  // reasonable baseline for a page-serving app but not deliberate for
  // an endpoint that renders no pages -- every directive below is
  // written explicitly rather than inherited.
  // The actual browser-facing app is apps/web, which gets its own
  // matching headers (see apps/web/next.config.js).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          imgSrc: ["'self'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          fontSrc: ["'none'"],
        },
      },
    }),
  );

  // Swagger UI (served at /api/docs) renders its own inline <style>/
  // <script> tags -- the closed policy above would break it. Registered
  // after the global helmet() above so it wins for this one path only;
  // every other route keeps the closed policy untouched.
  app.use(
    "/api/docs",
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          baseUri: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'", "data:"],
        },
      },
    }),
  );

  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("QuestLearn API")
    .setDescription("QuestLearn API documentation")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(env.PORT);
  console.log(`QuestLearn API listening on port ${env.PORT}`);
}

bootstrap();

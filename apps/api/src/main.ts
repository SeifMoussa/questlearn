import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { EnvValidationError, loadEnv } from "@questlearn/config";
import { AppModule } from "./app.module";

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
    origin: env.WEB_URL ?? true,
    credentials: true,
  });

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

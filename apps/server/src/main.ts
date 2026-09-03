import "reflect-metadata";
import "./env";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AppModule } from "./app.module";
import { ZodExceptionFilter } from "./zod-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.useGlobalFilters(new ZodExceptionFilter());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  });

  const webDist = join(process.cwd(), "apps/web/dist");
  if (existsSync(webDist)) app.useStaticAssets(webDist);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  console.log(`IIT API listening on http://localhost:${port}`);
}

void bootstrap();

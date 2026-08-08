import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import * as Sentry from "@sentry/node";

for (const envFile of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
    break;
  }
}

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "development" });
}

async function bootstrap() {
  if (
    process.env.DATABASE_URL?.includes("pooler.supabase.com") &&
    !/[?&]sslmode=/.test(process.env.DATABASE_URL)
  ) {
    process.env.DATABASE_URL += process.env.DATABASE_URL.includes("?")
      ? "&sslmode=require"
      : "?sslmode=require";
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.WEB_URL ?? "http://localhost:3000", credentials: true });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" });
  app.setGlobalPrefix("v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 4000);
}

bootstrap();

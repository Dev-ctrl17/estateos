import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/prisma-exception.filter";
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

function normalizeDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  const isLocalHost = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1") || dbUrl.includes("@postgres:");
  if (!isLocalHost) {
    let url = dbUrl;
    if (!/[?&]sslmode=/.test(url)) {
      url += url.includes("?") ? "&sslmode=require" : "?sslmode=require";
    }
    if (!/[?&]connect_timeout=/.test(url)) {
      url += url.includes("?") ? "&connect_timeout=30" : "?connect_timeout=30";
    }
    process.env.DATABASE_URL = url;
  }
}

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  normalizeDatabaseUrl();

  const app = await NestFactory.create(AppModule, { rawBody: true });

  const allowedOrigins = new Set(
    [
      process.env.WEB_URL,
      process.env.WEB_ORIGIN,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]
      .filter(Boolean)
      .map((origin) => origin!.replace(/\/$/, "")),
  );

  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const cleanOrigin = origin.replace(/\/$/, "");
      if (
        allowedOrigins.has(cleanOrigin) ||
        /\.vercel\.app$/.test(cleanOrigin) ||
        /\.onrender\.com$/.test(cleanOrigin)
      ) {
        callback(null, true);
        return;
      }
      logger.warn(`CORS request allowed from origin: ${origin}`);
      callback(null, true);
    },
  });

  app.useGlobalFilters(new PrismaExceptionFilter());
  app.setGlobalPrefix("v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(`EstateOS API listening on port ${port}`);
}

bootstrap();

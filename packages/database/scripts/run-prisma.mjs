import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootEnvFile = resolve(scriptDirectory, "../../../.env");
// Local development may use a root .env file; hosted builds provide env vars
// through the platform and therefore do not have that file on disk.
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

if (
  process.env.DATABASE_URL?.includes("pooler.supabase.com") &&
  !/[?&]sslmode=/.test(process.env.DATABASE_URL)
) {
  process.env.DATABASE_URL += process.env.DATABASE_URL.includes("?")
    ? "&sslmode=require"
    : "?sslmode=require";
}

const argumentsForPrisma = process.argv.slice(2).filter((argument) => argument !== "--");

const prismaCli = resolve(scriptDirectory, "../node_modules/prisma/build/index.js");
const child = spawn(process.execPath, [prismaCli, ...argumentsForPrisma], {
  env: process.env,
  stdio: "inherit",
});

child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});

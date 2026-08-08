import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(scriptDirectory, "../../../.env"));

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

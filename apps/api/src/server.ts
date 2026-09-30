import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./config/env.js";
import { buildApp } from "./app.js";

// Prefer apps/api/.env (Prisma + Vitest); root .env is fallback only.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, "../../.env") });

const env = loadEnv();
const app = await buildApp();

await app.listen({ port: env.PORT, host: "0.0.0.0" });

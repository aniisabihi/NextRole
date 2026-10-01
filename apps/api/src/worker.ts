import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Prefer apps/api/.env (Prisma + Vitest); root .env is fallback only.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, "../../.env") });

// Stub: real reminder worker lands in Task 4.
console.log("worker starting");

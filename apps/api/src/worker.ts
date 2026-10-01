import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Prefer apps/api/.env (Prisma + Vitest); root .env is fallback only.
const apiRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, "../../.env") });

const { prisma } = await import("./db/prisma.js");
const { closeReminderQueue } = await import("./jobs/queue.js");
const { startReminderWorker } = await import("./jobs/reminder-worker.js");
const { startReconcileLoop } = await import("./jobs/reminder-reconcile.js");

const worker = startReminderWorker();
console.log("[worker] reminder worker started");
// Boot sweep now, then every ~60s (repairs lost/missing jobs + overdue SCHEDULED).
const reconcileLoop = startReconcileLoop();

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, closing`);
  try {
    await reconcileLoop.stop();
    await worker.close();
    await closeReminderQueue();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

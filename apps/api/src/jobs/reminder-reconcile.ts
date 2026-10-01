import { prisma } from "../db/prisma.js";
import {
  enqueueReminder,
  removeReminderJob,
  reminderJobExists,
  reminderJobId,
} from "./reminder-queue.js";

export const RECONCILE_INTERVAL_MS = 60_000;

export type ReconcileStats = {
  checked: number;
  enqueued: number;
  failed: number;
};

/**
 * Repair Redis from Postgres truth. For every SCHEDULED reminder (overdue
 * included): if `bullJobId` is null/stale (not the versioned id for the
 * current `dueAt`) or the job is gone, enqueue via the shared helper with
 * `delay = max(0, dueAt - now)`. Fire still goes through the worker CAS —
 * never marks DUE directly. Per-row failures are logged and counted; the
 * sweep stops early if Redis itself is unreachable.
 */
export async function reconcileScheduledReminders(
  now: Date = new Date(),
): Promise<ReconcileStats> {
  const rows = await prisma.reminder.findMany({
    where: { status: "SCHEDULED" },
    select: { id: true, dueAt: true, bullJobId: true },
    orderBy: { dueAt: "asc" },
  });
  const stats: ReconcileStats = {
    checked: rows.length,
    enqueued: 0,
    failed: 0,
  };

  for (const row of rows) {
    try {
      const expected = reminderJobId(row.id, row.dueAt);
      if (row.bullJobId === expected && (await reminderJobExists(expected))) {
        continue;
      }
      const bullJobId = await enqueueReminder(row, now);
      const res = await prisma.reminder.updateMany({
        where: { id: row.id, status: "SCHEDULED", dueAt: row.dueAt },
        data: { bullJobId },
      });
      if (res.count !== 1) {
        // Fired/dismissed/rescheduled meanwhile: drop the job just added.
        await removeReminderJob(bullJobId);
        continue;
      }
      stats.enqueued++;
    } catch (err) {
      stats.failed++;
      console.error(
        `[reconcile] reminder ${row.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return stats;
}

export type ReconcileLoop = {
  /** Stop ticking and wait for any in-flight sweep. */
  stop: () => Promise<void>;
};

/** Run a sweep now (boot) and then every `intervalMs`; sweeps never overlap or throw. */
export function startReconcileLoop(
  intervalMs: number = RECONCILE_INTERVAL_MS,
): ReconcileLoop {
  let stopped = false;
  let inFlight: Promise<void> | undefined;

  const tick = (): void => {
    if (stopped || inFlight) return;
    inFlight = (async () => {
      try {
        const stats = await reconcileScheduledReminders();
        if (stats.enqueued > 0 || stats.failed > 0) {
          console.log(
            `[reconcile] checked=${stats.checked} enqueued=${stats.enqueued} failed=${stats.failed}`,
          );
        }
      } catch (err) {
        console.error(
          "[reconcile] sweep failed:",
          err instanceof Error ? err.message : err,
        );
      } finally {
        inFlight = undefined;
      }
    })();
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}

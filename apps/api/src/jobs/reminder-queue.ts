import { getReminderQueue } from "./queue.js";

export type ReminderJobData = { reminderId: string };

/** With enableOfflineQueue:false BullMQ still waits for the initial connect; bound it so HTTP never hangs. */
export const QUEUE_OP_TIMEOUT_MS = 2000;

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out (redis unavailable?)`)),
          QUEUE_OP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** BullMQ forbids ":" in custom job ids. Versioned by dueAt so reschedules never collide. */
export function reminderJobId(reminderId: string, dueAt: Date): string {
  return `reminder-${reminderId}-${dueAt.getTime()}`;
}

/**
 * Remove a job by id if present. Swallows "job is locked/active" style errors
 * because the worker CAS + stale-job guard make a surviving job harmless.
 */
export async function removeReminderJob(
  jobId: string | null | undefined,
): Promise<void> {
  if (!jobId) return;
  const job = await withTimeout(getReminderQueue().getJob(jobId), "getJob");
  if (!job) return;
  try {
    await withTimeout(job.remove(), "job.remove");
  } catch (err) {
    console.error(
      `[reminder-queue] remove ${jobId} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Schedule (or reschedule) a delayed job. Remove-then-add: drops the previous
 * job (if any) and any existing job with the new id, then adds with
 * delay = max(0, dueAt - now). Returns the new job id (persist in Reminder.bullJobId).
 * Throws on Redis failure — callers catch/log; HTTP must not fail.
 */
export async function enqueueReminder(
  reminder: { id: string; dueAt: Date; bullJobId?: string | null },
  now: Date = new Date(),
): Promise<string> {
  const jobId = reminderJobId(reminder.id, reminder.dueAt);
  if (reminder.bullJobId) await removeReminderJob(reminder.bullJobId);
  if (reminder.bullJobId !== jobId) await removeReminderJob(jobId);
  const delay = Math.max(0, reminder.dueAt.getTime() - now.getTime());
  try {
    await withTimeout(
      getReminderQueue().add(
        "fire",
        { reminderId: reminder.id } satisfies ReminderJobData,
        { jobId, delay, removeOnComplete: true, removeOnFail: true },
      ),
      "queue.add",
    );
  } catch (err) {
    // Active/locked job with same id cannot be removed+re-added; treat as scheduled.
    if (await reminderJobExists(jobId)) return jobId;
    throw err;
  }
  return jobId;
}

/** True if a job with this id is currently in the queue (any state). Throws on Redis failure. */
export async function reminderJobExists(jobId: string): Promise<boolean> {
  const job = await withTimeout(getReminderQueue().getJob(jobId), "getJob");
  return Boolean(job);
}

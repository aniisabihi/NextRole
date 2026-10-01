import {
  enqueueReminder,
  removeReminderJob,
} from "../../jobs/reminder-queue.js";

/** Enqueue; on Redis failure log and return null (HTTP must not fail after DB commit). */
export async function safeEnqueue(reminder: {
  id: string;
  dueAt: Date;
  bullJobId?: string | null;
}): Promise<string | null> {
  try {
    return await enqueueReminder(reminder);
  } catch (err) {
    console.error(
      `[reminders] enqueue ${reminder.id} failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Remove jobs post-commit; never throws. */
export async function safeRemoveJobs(
  jobIds: Array<string | null | undefined>,
): Promise<void> {
  for (const id of jobIds) {
    if (!id) continue;
    try {
      await removeReminderJob(id);
    } catch (err) {
      console.error(
        `[reminders] remove job ${id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

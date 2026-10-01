import { Worker, type Job } from "bullmq";
import { prisma } from "../db/prisma.js";
import { processReminderJob } from "../modules/reminders/process-reminder-job.js";
import {
  createWorkerConnection,
  getQueuePrefix,
  REMINDER_QUEUE_NAME,
} from "./queue.js";
import {
  enqueueReminder,
  removeReminderJob,
  type ReminderJobData,
} from "./reminder-queue.js";

/** Job handler: fire via CAS; on early/stale job re-enqueue with the correct delay. */
export async function handleReminderJob(
  job: Pick<Job<ReminderJobData>, "data">,
): Promise<void> {
  const { reminderId } = job.data;
  const result = await processReminderJob(reminderId);
  if (result.outcome !== "reenqueue") return;

  const bullJobId = await enqueueReminder({
    id: reminderId,
    dueAt: result.dueAt,
  });
  const res = await prisma.reminder.updateMany({
    where: { id: reminderId, status: "SCHEDULED", dueAt: result.dueAt },
    data: { bullJobId },
  });
  if (res.count !== 1) {
    // Dismissed/rescheduled meanwhile: drop the job we just added (fire CAS would no-op anyway).
    await removeReminderJob(bullJobId);
  }
}

export function startReminderWorker(): Worker<ReminderJobData> {
  const worker = new Worker<ReminderJobData>(
    REMINDER_QUEUE_NAME,
    handleReminderJob,
    {
      connection: createWorkerConnection(),
      prefix: getQueuePrefix(),
    },
  );
  worker.on("error", (err) => {
    console.error("[reminder-worker] error:", err.message);
  });
  worker.on("failed", (job, err) => {
    console.error(`[reminder-worker] job ${job?.id} failed:`, err.message);
  });
  return worker;
}

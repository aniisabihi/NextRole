import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Worker } from "bullmq";
import { prisma } from "../../src/db/prisma.js";
import {
  createQueueConnection,
  createWorkerConnection,
  getReminderQueue,
} from "../../src/jobs/queue.js";
import { startReminderWorker } from "../../src/jobs/reminder-worker.js";
import { reminderJobId } from "../../src/jobs/reminder-queue.js";
import { createTestUser, resetDb } from "../helpers/db.js";
import {
  closeQueueAfterTests,
  resetReminderQueue,
  seedReminder,
} from "../helpers/reminders.js";

async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 8000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("reminder worker (Redis)", () => {
  let worker: Worker | undefined;

  beforeEach(async () => {
    await resetDb();
    await resetReminderQueue();
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
  });

  afterAll(async () => {
    await resetDb();
    await resetReminderQueue();
    await closeQueueAfterTests();
    await prisma.$disconnect();
  });

  async function setup() {
    const user = await createTestUser();
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        company: "Co",
        title: "Role",
        employmentType: "FULL_TIME",
        workplaceType: "REMOTE",
      },
    });
    return { user, application };
  }

  it("worker connection uses maxRetriesPerRequest:null, producer does not", () => {
    expect(createWorkerConnection()).toMatchObject({
      maxRetriesPerRequest: null,
    });
    expect(createQueueConnection()).toMatchObject({
      enableOfflineQueue: false,
    });
    expect(createQueueConnection()).not.toHaveProperty("maxRetriesPerRequest");
  });

  it("enqueue delay 0 → worker marks DUE + one activity; job removed", async () => {
    const { user, application } = await setup();
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() + 100),
      enqueue: true,
    });
    worker = startReminderWorker();
    const row = await waitFor(async () => {
      const x = await prisma.reminder.findUniqueOrThrow({
        where: { id: r.id },
      });
      return x.status === "DUE" ? x : null;
    });
    expect(row.firedAt).toBeInstanceOf(Date);
    expect(
      await prisma.activity.count({
        where: { applicationId: application.id, type: "REMINDER_FIRED" },
      }),
    ).toBe(1);
    await waitFor(async () => !(await getReminderQueue().getJob(r.bullJobId!)));
  });

  it("stale early job: row stays SCHEDULED and is re-enqueued with versioned delayed id", async () => {
    const { user, application } = await setup();
    const dueAt = new Date(Date.now() + 3_600_000);
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt,
    });
    // Stale job (old id) fires immediately for a row due in 1h.
    await getReminderQueue().add(
      "fire",
      { reminderId: r.id },
      { jobId: `reminder-${r.id}-1`, removeOnComplete: true },
    );
    worker = startReminderWorker();
    const expectedId = reminderJobId(r.id, dueAt);
    const job = await waitFor(() => getReminderQueue().getJob(expectedId));
    expect(await job.getState()).toBe("delayed");
    const row = await waitFor(async () => {
      const x = await prisma.reminder.findUniqueOrThrow({
        where: { id: r.id },
      });
      return x.bullJobId === expectedId ? x : null;
    });
    expect(row.status).toBe("SCHEDULED");
    expect(
      await prisma.activity.count({ where: { applicationId: application.id } }),
    ).toBe(0);
  });

  it("job for deleted reminder: acked, no crash", async () => {
    await getReminderQueue().add(
      "fire",
      { reminderId: "ghost" },
      { jobId: "reminder-ghost-1", removeOnComplete: true },
    );
    worker = startReminderWorker();
    await waitFor(
      async () => !(await getReminderQueue().getJob("reminder-ghost-1")),
    );
  });
});

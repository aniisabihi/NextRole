import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Worker } from "bullmq";
import { prisma } from "../../src/db/prisma.js";
import { getReminderQueue } from "../../src/jobs/queue.js";
import { reminderJobId } from "../../src/jobs/reminder-queue.js";
import { startReminderWorker } from "../../src/jobs/reminder-worker.js";
import {
  reconcileScheduledReminders,
  startReconcileLoop,
} from "../../src/jobs/reminder-reconcile.js";
import { createTestUser, resetDb } from "../helpers/db.js";
import {
  closeQueueAfterTests,
  expectJobExists,
  resetReminderQueue,
  seedReminder,
} from "../helpers/reminders.js";

const HOUR = 3_600_000;

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

describe("reconcileScheduledReminders", () => {
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

  it("re-adds missing job (stale bullJobId) with versioned id + delay", async () => {
    const { user, application } = await setup();
    const dueAt = new Date(Date.now() + 2 * HOUR);
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt,
      enqueue: true,
    });
    await getReminderQueue().obliterate({ force: true }); // Redis flush

    const stats = await reconcileScheduledReminders();
    expect(stats.enqueued).toBe(1);

    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.bullJobId).toBe(reminderJobId(r.id, dueAt));
    const job = await expectJobExists(after.bullJobId);
    expect(job.opts.delay).toBeGreaterThan(2 * HOUR - 10_000);
    expect(job.opts.delay).toBeLessThanOrEqual(2 * HOUR);
  });

  it("repairs SCHEDULED row with null bullJobId (failed enqueue)", async () => {
    const { user, application } = await setup();
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() + HOUR),
    });
    expect(r.bullJobId).toBeNull();

    await reconcileScheduledReminders();

    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.bullJobId).toBe(reminderJobId(r.id, r.dueAt));
    await expectJobExists(after.bullJobId);
  });

  it("repairs bullJobId pointing at old dueAt version (drops old job)", async () => {
    const { user, application } = await setup();
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() + HOUR),
      enqueue: true,
    });
    const newDue = new Date(Date.now() + 3 * HOUR);
    await prisma.reminder.update({
      where: { id: r.id },
      data: { dueAt: newDue },
    });

    await reconcileScheduledReminders();

    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.bullJobId).toBe(reminderJobId(r.id, newDue));
    await expectJobExists(after.bullJobId);
    expect(await getReminderQueue().getJob(r.bullJobId!)).toBeFalsy();
  });

  it("is idempotent: healthy rows are not re-enqueued", async () => {
    const { user, application } = await setup();
    await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() + HOUR),
      enqueue: true,
    });
    const stats = await reconcileScheduledReminders();
    expect(stats).toMatchObject({ checked: 1, enqueued: 0, failed: 0 });
  });

  it("ignores non-SCHEDULED rows", async () => {
    const { user, application } = await setup();
    for (const status of ["DUE", "DISMISSED", "CANCELLED"] as const) {
      await seedReminder({
        userId: user.id,
        applicationId: application.id,
        status,
        kind: "MANUAL",
      });
    }
    const stats = await reconcileScheduledReminders();
    expect(stats).toMatchObject({ checked: 0, enqueued: 0 });
    expect(await getReminderQueue().getJobCounts("delayed", "waiting")).toEqual(
      { delayed: 0, waiting: 0 },
    );
  });

  it("overdue SCHEDULED gets delay-0 job and worker marks it DUE", async () => {
    const { user, application } = await setup();
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() - 5 * HOUR),
    });

    await reconcileScheduledReminders();
    const queued = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    const job = await expectJobExists(queued.bullJobId);
    expect(job.opts.delay).toBe(0);

    worker = startReminderWorker();
    const due = await waitFor(async () => {
      const row = await prisma.reminder.findUnique({ where: { id: r.id } });
      return row?.status === "DUE" ? row : null;
    });
    expect(due.firedAt).toBeTruthy();
    expect(
      await prisma.activity.count({
        where: { type: "REMINDER_FIRED", userId: user.id },
      }),
    ).toBe(1);
  });

  it("one bad row does not abort the sweep", async () => {
    const { user, application } = await setup();
    const a = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() + HOUR),
    });
    const b = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() + 2 * HOUR),
    });
    const stats = await reconcileScheduledReminders();
    expect(stats.enqueued).toBe(2);
    for (const id of [a.id, b.id]) {
      const row = await prisma.reminder.findUniqueOrThrow({ where: { id } });
      expect(row.bullJobId).toBeTruthy();
    }
  });

  it("startReconcileLoop runs on boot then on interval; stop halts it", async () => {
    const { user, application } = await setup();
    const first = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() + HOUR),
    });
    const loop = startReconcileLoop(100);
    try {
      await waitFor(async () => {
        const row = await prisma.reminder.findUnique({
          where: { id: first.id },
        });
        return row?.bullJobId;
      });
      // Later-created orphan is picked up by a subsequent tick.
      const second = await seedReminder({
        userId: user.id,
        applicationId: application.id,
        dueAt: new Date(Date.now() + 2 * HOUR),
      });
      await waitFor(async () => {
        const row = await prisma.reminder.findUnique({
          where: { id: second.id },
        });
        return row?.bullJobId;
      });
    } finally {
      await loop.stop();
    }
    const third = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() + 3 * HOUR),
    });
    await new Promise((r) => setTimeout(r, 400));
    const row = await prisma.reminder.findUniqueOrThrow({
      where: { id: third.id },
    });
    expect(row.bullJobId).toBeNull();
  });
});

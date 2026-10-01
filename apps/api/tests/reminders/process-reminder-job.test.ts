import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import {
  FIRE_SKEW_MS,
  processReminderJob,
} from "../../src/modules/reminders/process-reminder-job.js";
import { createTestUser, resetDb } from "../helpers/db.js";
import { seedReminder } from "../helpers/reminders.js";

// DB only — no Redis.
describe("processReminderJob", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await resetDb();
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

  const firedActivities = (applicationId: string) =>
    prisma.activity.findMany({
      where: { applicationId, type: "REMINDER_FIRED" },
    });

  it("fires due SCHEDULED: DUE + firedAt + one REMINDER_FIRED activity", async () => {
    const { user, application } = await setup();
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      title: "Ping",
      dueAt: new Date(Date.now() - 1000),
    });
    const res = await processReminderJob(r.id);
    expect(res).toEqual({ outcome: "fired" });
    const row = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(row.status).toBe("DUE");
    expect(row.firedAt).toBeInstanceOf(Date);
    const acts = await firedActivities(application.id);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({
      userId: user.id,
      payload: { reminderId: r.id, kind: "MANUAL", title: "Ping" },
    });
  });

  it("is idempotent: second call no-ops, no second activity", async () => {
    const { user, application } = await setup();
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() - 1000),
    });
    expect((await processReminderJob(r.id)).outcome).toBe("fired");
    const firedAt = (
      await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })
    ).firedAt;
    expect((await processReminderJob(r.id)).outcome).toBe("noop");
    expect(await firedActivities(application.id)).toHaveLength(1);
    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.firedAt).toEqual(firedAt);
  });

  it("concurrent calls: exactly one activity", async () => {
    const { user, application } = await setup();
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(Date.now() - 1000),
    });
    const results = await Promise.all([
      processReminderJob(r.id),
      processReminderJob(r.id),
      processReminderJob(r.id),
    ]);
    expect(results.filter((x) => x.outcome === "fired")).toHaveLength(1);
    expect(await firedActivities(application.id)).toHaveLength(1);
  });

  it.each(["DISMISSED", "CANCELLED", "DUE"] as const)(
    "status %s (e.g. dismiss race): no-op, no activity",
    async (status) => {
      const { user, application } = await setup();
      const r = await seedReminder({
        userId: user.id,
        applicationId: application.id,
        status,
        dueAt: new Date(Date.now() - 1000),
      });
      expect((await processReminderJob(r.id)).outcome).toBe("noop");
      expect(await firedActivities(application.id)).toHaveLength(0);
      const row = await prisma.reminder.findUniqueOrThrow({
        where: { id: r.id },
      });
      expect(row.status).toBe(status);
      expect(row.firedAt).toBeNull();
    },
  );

  it("dueAt in future beyond skew: no-op + reenqueue signal", async () => {
    const { user, application } = await setup();
    const dueAt = new Date(Date.now() + 3_600_000);
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt,
    });
    const res = await processReminderJob(r.id);
    expect(res).toEqual({ outcome: "reenqueue", dueAt });
    const row = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(row.status).toBe("SCHEDULED");
    expect(row.firedAt).toBeNull();
    expect(await firedActivities(application.id)).toHaveLength(0);
  });

  it("dueAt within skew fires", async () => {
    const { user, application } = await setup();
    const now = new Date();
    const r = await seedReminder({
      userId: user.id,
      applicationId: application.id,
      dueAt: new Date(now.getTime() + FIRE_SKEW_MS - 50),
    });
    expect((await processReminderJob(r.id, now)).outcome).toBe("fired");
  });

  it("missing row: missing outcome, no throw", async () => {
    expect(await processReminderJob("nope")).toEqual({ outcome: "missing" });
  });
});

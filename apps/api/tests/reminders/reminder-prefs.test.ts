import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { getReminderQueue } from "../../src/jobs/queue.js";
import { reminderJobId } from "../../src/jobs/reminder-queue.js";
import { resetDb } from "../helpers/db.js";
import {
  createApplicationFor,
  loginSession,
  mutHeaders,
} from "../helpers/interviews.js";
import {
  closeQueueAfterTests,
  expectJobExists,
  expectJobGone,
  resetReminderQueue,
  seedReminder,
} from "../helpers/reminders.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("reminder prefs API", () => {
  let app: FastifyInstance;
  const prevMax = process.env.AUTH_RATE_LIMIT_MAX;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetDb();
    await resetReminderQueue();
  });

  afterAll(async () => {
    await app.close();
    await closeQueueAfterTests();
    await prisma.$disconnect();
    if (prevMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = prevMax;
  });

  type Session = Awaited<ReturnType<typeof loginSession>>;

  const get = (session: Session) =>
    app.inject({
      method: "GET",
      url: "/api/me/reminder-prefs",
      headers: { Cookie: session.cookieHeader },
    });

  const patch = (session: Session, payload: unknown) =>
    app.inject({
      method: "PATCH",
      url: "/api/me/reminder-prefs",
      headers: mutHeaders(session),
      payload: payload as object,
    });

  async function backdateCreatedAt(id: string, createdAt: Date) {
    await prisma.reminder.update({ where: { id }, data: { createdAt } });
  }

  it("GET returns defaults", async () => {
    const session = await loginSession(app);
    const res = await get(session);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ interviewLeadHours: 24, followUpDays: 7 });
  });

  it("GET requires auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/me/reminder-prefs",
    });
    expect(res.statusCode).toBe(401);
  });

  it("PATCH persists and returns new values (partial ok)", async () => {
    const session = await loginSession(app);
    const res = await patch(session, { interviewLeadHours: 48 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ interviewLeadHours: 48, followUpDays: 7 });
    expect((await get(session)).json()).toEqual({
      interviewLeadHours: 48,
      followUpDays: 7,
    });
  });

  it.each([
    [{ interviewLeadHours: 0 }],
    [{ interviewLeadHours: 169 }],
    [{ interviewLeadHours: 1.5 }],
    [{ followUpDays: 0 }],
    [{ followUpDays: 91 }],
    [{ followUpDays: "7" }],
    [{}],
  ])("PATCH rejects invalid %j with 400", async (payload) => {
    const session = await loginSession(app);
    const res = await patch(session, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH accepts boundary values", async () => {
    const session = await loginSession(app);
    const res = await patch(session, {
      interviewLeadHours: 1,
      followUpDays: 90,
    });
    expect(res.statusCode).toBe(200);
    const res2 = await patch(session, {
      interviewLeadHours: 168,
      followUpDays: 1,
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ interviewLeadHours: 168, followUpDays: 1 });
  });

  it("PATCH reschedules FOLLOW_UP from createdAt + followUpDays", async () => {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    const r = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      kind: "FOLLOW_UP",
      dueAt: new Date(Date.now() + 7 * DAY),
      enqueue: true,
    });
    const createdAt = new Date(Date.now() - 2 * DAY);
    await backdateCreatedAt(r.id, createdAt);

    const res = await patch(session, { followUpDays: 14 });
    expect(res.statusCode).toBe(200);

    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    const expected = new Date(createdAt.getTime() + 14 * DAY);
    expect(after.status).toBe("SCHEDULED");
    expect(after.dueAt.getTime()).toBe(expected.getTime());
    expect(after.bullJobId).toBe(reminderJobId(r.id, expected));
    await expectJobExists(after.bullJobId);
    await expectJobGone(r.bullJobId);
  });

  it("PATCH FOLLOW_UP new dueAt in the past -> job with delay 0", async () => {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    const r = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      kind: "FOLLOW_UP",
      dueAt: new Date(Date.now() + 7 * DAY),
      enqueue: true,
    });
    await backdateCreatedAt(r.id, new Date(Date.now() - 5 * DAY));

    const res = await patch(session, { followUpDays: 2 });
    expect(res.statusCode).toBe(200);

    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.dueAt.getTime()).toBeLessThan(Date.now());
    const job = await expectJobExists(after.bullJobId);
    expect(job.opts.delay).toBe(0);
  });

  it("PATCH reschedules INTERVIEW from scheduledAt - newLead", async () => {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    const scheduledAt = new Date(Date.now() + 72 * HOUR);
    const created = await app.inject({
      method: "POST",
      url: `/api/applications/${application.id}/interviews`,
      headers: mutHeaders(session),
      payload: { scheduledAt: scheduledAt.toISOString(), type: "VIDEO" },
    });
    expect(created.statusCode).toBe(201);
    const interviewId = created.json().interview.id as string;
    const before = await prisma.reminder.findFirstOrThrow({
      where: { interviewId, kind: "INTERVIEW" },
    });

    const res = await patch(session, { interviewLeadHours: 48 });
    expect(res.statusCode).toBe(200);

    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: before.id },
    });
    const expected = new Date(scheduledAt.getTime() - 48 * HOUR);
    expect(after.status).toBe("SCHEDULED");
    expect(after.dueAt.getTime()).toBe(expected.getTime());
    await expectJobExists(after.bullJobId);
    await expectJobGone(before.bullJobId);
  });

  it("PATCH INTERVIEW lead already passed (null) -> cancels + removes job", async () => {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    const scheduledAt = new Date(Date.now() + 30 * HOUR);
    const created = await app.inject({
      method: "POST",
      url: `/api/applications/${application.id}/interviews`,
      headers: mutHeaders(session),
      payload: { scheduledAt: scheduledAt.toISOString(), type: "VIDEO" },
    });
    const interviewId = created.json().interview.id as string;
    const before = await prisma.reminder.findFirstOrThrow({
      where: { interviewId, kind: "INTERVIEW" },
    });
    await expectJobExists(before.bullJobId);

    const res = await patch(session, { interviewLeadHours: 48 });
    expect(res.statusCode).toBe(200);

    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.status).toBe("CANCELLED");
    await expectJobGone(before.bullJobId);
  });

  it("PATCH skips INTERVIEW reminder whose interview is not SCHEDULED", async () => {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    const interview = await prisma.interview.create({
      data: {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 72 * HOUR),
        type: "VIDEO",
        status: "COMPLETED",
      },
    });
    const dueAt = new Date(Date.now() + 48 * HOUR);
    const r = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      kind: "INTERVIEW",
      interviewId: interview.id,
      dueAt,
      enqueue: true,
    });

    const res = await patch(session, { interviewLeadHours: 12 });
    expect(res.statusCode).toBe(200);
    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.dueAt.getTime()).toBe(dueAt.getTime());
    expect(after.bullJobId).toBe(r.bullJobId);
  });

  it("PATCH leaves MANUAL, DUE, and other users' reminders alone", async () => {
    const session = await loginSession(app);
    const other = await loginSession(app);
    const application = await createApplicationFor(app, session);
    const otherApp = await createApplicationFor(app, other);
    const manual = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      kind: "MANUAL",
      enqueue: true,
    });
    const due = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      kind: "FOLLOW_UP",
      status: "DUE",
    });
    const theirs = await seedReminder({
      userId: other.user.id,
      applicationId: otherApp.id,
      kind: "FOLLOW_UP",
      dueAt: new Date(Date.now() + 7 * DAY),
      enqueue: true,
    });

    const res = await patch(session, {
      followUpDays: 30,
      interviewLeadHours: 2,
    });
    expect(res.statusCode).toBe(200);

    for (const row of [manual, due, theirs]) {
      const after = await prisma.reminder.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(after.dueAt.getTime()).toBe(row.dueAt.getTime());
      expect(after.status).toBe(row.status);
      expect(after.bullJobId).toBe(row.bullJobId);
    }
  });

  it("PATCH with unchanged values skips all work", async () => {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    // Tampered dueAt: a reschedule would "fix" it; unchanged prefs must not touch it.
    const dueAt = new Date(Date.now() + 3 * DAY);
    const r = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      kind: "FOLLOW_UP",
      dueAt,
      enqueue: true,
    });
    const userBefore = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });

    const res = await patch(session, {
      followUpDays: 7,
      interviewLeadHours: 24,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ interviewLeadHours: 24, followUpDays: 7 });

    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.dueAt.getTime()).toBe(dueAt.getTime());
    expect(after.bullJobId).toBe(r.bullJobId);
    expect(after.updatedAt.getTime()).toBe(r.updatedAt.getTime());
    const userAfter = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });
    expect(userAfter.updatedAt.getTime()).toBe(userBefore.updatedAt.getTime());
  });

  it("changing only followUpDays does not touch INTERVIEW reminders", async () => {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    const interview = await prisma.interview.create({
      data: {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 72 * HOUR),
        type: "VIDEO",
      },
    });
    // Overdue-but-SCHEDULED interview reminder (worker lag): must survive.
    const dueAt = new Date(Date.now() - HOUR);
    const r = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      kind: "INTERVIEW",
      interviewId: interview.id,
      dueAt,
    });
    const res = await patch(session, { followUpDays: 30 });
    expect(res.statusCode).toBe(200);
    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(after.status).toBe("SCHEDULED");
    expect(after.dueAt.getTime()).toBe(dueAt.getTime());
  });

  it("PATCH with no open reminders leaves queue empty", async () => {
    const session = await loginSession(app);
    const res = await patch(session, { followUpDays: 10 });
    expect(res.statusCode).toBe(200);
    expect(await getReminderQueue().getJobCounts("delayed", "waiting")).toEqual(
      { delayed: 0, waiting: 0 },
    );
  });
});

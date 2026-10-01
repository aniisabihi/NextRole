import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ApplicationStatus } from "@prisma/client";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import {
  newReminderEffects,
  syncFollowUpOnStatusChange,
} from "../../src/modules/reminders/reminder-hooks.js";
import { resetDb } from "../helpers/db.js";
import { loginSession, mutHeaders } from "../helpers/interviews.js";
import {
  closeQueueAfterTests,
  csrfHeaders,
  expectJobExists,
  expectJobGone,
  resetReminderQueue,
  seedReminder,
} from "../helpers/reminders.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("auto INTERVIEW + FOLLOW_UP reminders", () => {
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

  async function createApp(
    session: Session,
    status?: ApplicationStatus,
  ): Promise<{ id: string; status: ApplicationStatus }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutHeaders(session),
      payload: {
        company: "Acme",
        title: "Role",
        employmentType: "FULL_TIME",
        workplaceType: "REMOTE",
        ...(status ? { status } : {}),
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().application;
  }

  async function setStatus(
    session: Session,
    id: string,
    status: ApplicationStatus,
  ) {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutHeaders(session),
      payload: { status },
    });
    expect(res.statusCode).toBe(200);
    return res.json().application as { id: string; status: ApplicationStatus };
  }

  async function createInterview(
    session: Session,
    applicationId: string,
    scheduledAt: Date,
  ) {
    const res = await app.inject({
      method: "POST",
      url: `/api/applications/${applicationId}/interviews`,
      headers: mutHeaders(session),
      payload: { scheduledAt: scheduledAt.toISOString(), type: "VIDEO" },
    });
    expect(res.statusCode).toBe(201);
    return res.json().interview as { id: string };
  }

  const interviewRows = (interviewId: string) =>
    prisma.reminder.findMany({
      where: { interviewId, kind: "INTERVIEW" },
      orderBy: { createdAt: "asc" },
    });

  const followUps = (applicationId: string) =>
    prisma.reminder.findMany({
      where: { applicationId, kind: "FOLLOW_UP" },
      orderBy: { createdAt: "asc" },
    });

  describe("INTERVIEW", () => {
    it("1. create with lead in future -> SCHEDULED row + job", async () => {
      const session = await loginSession(app);
      const application = await createApp(session);
      const scheduledAt = new Date(Date.now() + 48 * HOUR);
      const interview = await createInterview(
        session,
        application.id,
        scheduledAt,
      );

      const rows = await interviewRows(interview.id);
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.status).toBe("SCHEDULED");
      expect(row.userId).toBe(session.user.id);
      expect(row.applicationId).toBe(application.id);
      expect(row.dueAt.getTime()).toBe(scheduledAt.getTime() - 24 * HOUR);
      expect(row.title).toBe("Interview reminder: Acme — VIDEO");
      await expectJobExists(row.bullJobId);
    });

    it("2. reschedule cancels old SCHEDULED+DUE, creates new row + job", async () => {
      const session = await loginSession(app);
      const application = await createApp(session);
      const interview = await createInterview(
        session,
        application.id,
        new Date(Date.now() + 48 * HOUR),
      );
      const [old] = await interviewRows(interview.id);
      const due = await seedReminder({
        userId: session.user.id,
        applicationId: application.id,
        kind: "INTERVIEW",
        status: "DUE",
        interviewId: interview.id,
        dueAt: new Date(Date.now() - HOUR),
      });

      const next = new Date(Date.now() + 72 * HOUR);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/applications/${application.id}/interviews/${interview.id}`,
        headers: mutHeaders(session),
        payload: { scheduledAt: next.toISOString() },
      });
      expect(res.statusCode).toBe(200);

      const rows = await interviewRows(interview.id);
      const oldAfter = rows.find((r) => r.id === old!.id)!;
      const dueAfter = rows.find((r) => r.id === due.id)!;
      expect(oldAfter.status).toBe("CANCELLED");
      expect(dueAfter.status).toBe("CANCELLED");
      await expectJobGone(old!.bullJobId);

      const fresh = rows.filter((r) => r.status === "SCHEDULED");
      expect(fresh).toHaveLength(1);
      expect(fresh[0]!.dueAt.getTime()).toBe(next.getTime() - 24 * HOUR);
      expect(fresh[0]!.id).not.toBe(old!.id);
      await expectJobExists(fresh[0]!.bullJobId);
    });

    it("3a. delete cancels SCHEDULED + DUE reminders, removes job", async () => {
      const session = await loginSession(app);
      const application = await createApp(session);
      const interview = await createInterview(
        session,
        application.id,
        new Date(Date.now() + 48 * HOUR),
      );
      const [scheduled] = await interviewRows(interview.id);
      const due = await seedReminder({
        userId: session.user.id,
        applicationId: application.id,
        kind: "INTERVIEW",
        status: "DUE",
        interviewId: interview.id,
        dueAt: new Date(Date.now() - HOUR),
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/applications/${application.id}/interviews/${interview.id}`,
        headers: csrfHeaders(session),
      });
      expect(res.statusCode).toBe(204);

      // FK is SetNull, so look up by id after delete.
      const s = await prisma.reminder.findUniqueOrThrow({
        where: { id: scheduled!.id },
      });
      const d = await prisma.reminder.findUniqueOrThrow({
        where: { id: due.id },
      });
      expect(s.status).toBe("CANCELLED");
      expect(d.status).toBe("CANCELLED");
      await expectJobGone(scheduled!.bullJobId);
    });

    it("3b. leave SCHEDULED status cancels SCHEDULED + DUE reminders", async () => {
      const session = await loginSession(app);
      const application = await createApp(session);
      const interview = await createInterview(
        session,
        application.id,
        new Date(Date.now() + 48 * HOUR),
      );
      const [scheduled] = await interviewRows(interview.id);
      const due = await seedReminder({
        userId: session.user.id,
        applicationId: application.id,
        kind: "INTERVIEW",
        status: "DUE",
        interviewId: interview.id,
        dueAt: new Date(Date.now() - HOUR),
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/applications/${application.id}/interviews/${interview.id}`,
        headers: mutHeaders(session),
        payload: { status: "COMPLETED" },
      });
      expect(res.statusCode).toBe(200);

      const rows = await interviewRows(interview.id);
      expect(rows.every((r) => r.status === "CANCELLED")).toBe(true);
      expect(rows.map((r) => r.id).sort()).toEqual(
        [scheduled!.id, due.id].sort(),
      );
      await expectJobGone(scheduled!.bullJobId);
    });

    it("3c. non-schedule edit (notes) keeps reminder untouched", async () => {
      const session = await loginSession(app);
      const application = await createApp(session);
      const interview = await createInterview(
        session,
        application.id,
        new Date(Date.now() + 48 * HOUR),
      );
      const [before] = await interviewRows(interview.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/applications/${application.id}/interviews/${interview.id}`,
        headers: mutHeaders(session),
        payload: { notes: "bring laptop" },
      });
      expect(res.statusCode).toBe(200);
      const rows = await interviewRows(interview.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(before!.id);
      expect(rows[0]!.status).toBe("SCHEDULED");
      expect(rows[0]!.bullJobId).toBe(before!.bullJobId);
    });

    it("4. lead already passed -> no row (create and reschedule)", async () => {
      const session = await loginSession(app);
      const application = await createApp(session);
      // 2h away, lead 24h -> passed
      const interview = await createInterview(
        session,
        application.id,
        new Date(Date.now() + 2 * HOUR),
      );
      expect(await interviewRows(interview.id)).toHaveLength(0);

      // Reschedule far out -> row appears; reschedule near -> cancelled, no new row.
      await app.inject({
        method: "PATCH",
        url: `/api/applications/${application.id}/interviews/${interview.id}`,
        headers: mutHeaders(session),
        payload: {
          scheduledAt: new Date(Date.now() + 72 * HOUR).toISOString(),
        },
      });
      const afterFar = await interviewRows(interview.id);
      expect(afterFar.filter((r) => r.status === "SCHEDULED")).toHaveLength(1);

      await app.inject({
        method: "PATCH",
        url: `/api/applications/${application.id}/interviews/${interview.id}`,
        headers: mutHeaders(session),
        payload: {
          scheduledAt: new Date(Date.now() + 3 * HOUR).toISOString(),
        },
      });
      const afterNear = await interviewRows(interview.id);
      expect(afterNear.filter((r) => r.status === "SCHEDULED")).toHaveLength(0);
      expect(afterNear).toHaveLength(1);
    });
  });

  describe("FOLLOW_UP", () => {
    it("5. enter APPLIED from SAVED -> FOLLOW_UP + job", async () => {
      const session = await loginSession(app);
      const application = await createApp(session);
      const before = Date.now();
      await setStatus(session, application.id, "APPLIED");

      const rows = await followUps(application.id);
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.status).toBe("SCHEDULED");
      expect(row.userId).toBe(session.user.id);
      expect(row.title).toBe("Follow up: Acme");
      expect(row.interviewId).toBeNull();
      expect(row.dueAt.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY);
      expect(row.dueAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY);
      await expectJobExists(row.bullJobId);
    });

    it("5b. honors user followUpDays pref", async () => {
      const session = await loginSession(app);
      await prisma.user.update({
        where: { id: session.user.id },
        data: { followUpDays: 3 },
      });
      const application = await createApp(session);
      const before = Date.now();
      await setStatus(session, application.id, "SCREENING");
      const [row] = await followUps(application.id);
      expect(row!.dueAt.getTime()).toBeGreaterThanOrEqual(before + 3 * DAY);
      expect(row!.dueAt.getTime()).toBeLessThanOrEqual(Date.now() + 3 * DAY);
    });

    it("6. createApplication with APPLIED -> FOLLOW_UP; SAVED -> none", async () => {
      const session = await loginSession(app);
      const applied = await createApp(session, "APPLIED");
      const rows = await followUps(applied.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("SCHEDULED");
      await expectJobExists(rows[0]!.bullJobId);

      const screening = await createApp(session, "SCREENING");
      expect(await followUps(screening.id)).toHaveLength(1);

      const saved = await createApp(session, "SAVED");
      expect(await followUps(saved.id)).toHaveLength(0);

      const interview = await createApp(session, "INTERVIEW");
      expect(await followUps(interview.id)).toHaveLength(0);
    });

    it("7. APPLIED -> SCREENING (and back) keeps same row, no reset", async () => {
      const session = await loginSession(app);
      const application = await createApp(session, "APPLIED");
      const [before] = await followUps(application.id);

      await setStatus(session, application.id, "SCREENING");
      let rows = await followUps(application.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(before!.id);
      expect(rows[0]!.status).toBe("SCHEDULED");
      expect(rows[0]!.dueAt.getTime()).toBe(before!.dueAt.getTime());
      expect(rows[0]!.bullJobId).toBe(before!.bullJobId);
      await expectJobExists(rows[0]!.bullJobId);

      await setStatus(session, application.id, "APPLIED");
      rows = await followUps(application.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(before!.id);
      expect(rows[0]!.dueAt.getTime()).toBe(before!.dueAt.getTime());
    });

    it("8. leave set cancels SCHEDULED FOLLOW_UP; DUE stays", async () => {
      const session = await loginSession(app);
      const application = await createApp(session, "APPLIED");
      const [scheduled] = await followUps(application.id);
      const due = await seedReminder({
        userId: session.user.id,
        applicationId: application.id,
        kind: "FOLLOW_UP",
        status: "DUE",
        dueAt: new Date(Date.now() - HOUR),
      });

      await setStatus(session, application.id, "INTERVIEW");

      const s = await prisma.reminder.findUniqueOrThrow({
        where: { id: scheduled!.id },
      });
      const d = await prisma.reminder.findUniqueOrThrow({
        where: { id: due.id },
      });
      expect(s.status).toBe("CANCELLED");
      expect(d.status).toBe("DUE");
      await expectJobGone(scheduled!.bullJobId);
    });

    it("8b. re-enter set after leaving creates a fresh FOLLOW_UP", async () => {
      const session = await loginSession(app);
      const application = await createApp(session, "APPLIED");
      const [first] = await followUps(application.id);
      await setStatus(session, application.id, "INTERVIEW");
      await setStatus(session, application.id, "APPLIED");

      const rows = await followUps(application.id);
      expect(rows).toHaveLength(2);
      const scheduled = rows.filter((r) => r.status === "SCHEDULED");
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]!.id).not.toBe(first!.id);
      await expectJobExists(scheduled[0]!.bullJobId);
    });

    it("9a. entering with stale SCHEDULED FOLLOW_UP -> cancel-all then single new", async () => {
      const session = await loginSession(app);
      const application = await createApp(session); // SAVED
      const stale = await seedReminder({
        userId: session.user.id,
        applicationId: application.id,
        kind: "FOLLOW_UP",
        status: "SCHEDULED",
        dueAt: new Date(Date.now() + DAY),
        enqueue: true,
      });

      await setStatus(session, application.id, "APPLIED");

      const rows = await followUps(application.id);
      const scheduled = rows.filter((r) => r.status === "SCHEDULED");
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]!.id).not.toBe(stale.id);
      const staleAfter = rows.find((r) => r.id === stale.id)!;
      expect(staleAfter.status).toBe("CANCELLED");
      await expectJobGone(stale.bullJobId);
    });

    it("9b. hook decides from final (post-update) status, not previous", async () => {
      const session = await loginSession(app);
      const application = await createApp(session);
      const stale = await seedReminder({
        userId: session.user.id,
        applicationId: application.id,
        kind: "FOLLOW_UP",
        status: "SCHEDULED",
        dueAt: new Date(Date.now() + DAY),
      });

      // Pretend prev=SAVED but the row ended up REJECTED (e.g. concurrent move):
      // not in set -> no create, stale SCHEDULED cancelled.
      const effects = newReminderEffects();
      await prisma.$transaction(async (tx) => {
        await syncFollowUpOnStatusChange(
          tx,
          {
            application: {
              id: application.id,
              userId: session.user.id,
              company: "Acme",
              status: "REJECTED",
            },
            previousStatus: "SAVED",
          },
          effects,
        );
      });
      expect(effects.enqueue).toHaveLength(0);
      expect(
        (await prisma.reminder.findUniqueOrThrow({ where: { id: stale.id } }))
          .status,
      ).toBe("CANCELLED");

      // Final in set, prev outside -> exactly one new SCHEDULED.
      const effects2 = newReminderEffects();
      await prisma.$transaction(async (tx) => {
        await syncFollowUpOnStatusChange(
          tx,
          {
            application: {
              id: application.id,
              userId: session.user.id,
              company: "Acme",
              status: "SCREENING",
            },
            previousStatus: "SAVED",
          },
          effects2,
        );
      });
      expect(effects2.enqueue).toHaveLength(1);
      const scheduled = (await followUps(application.id)).filter(
        (r) => r.status === "SCHEDULED",
      );
      expect(scheduled).toHaveLength(1);
    });

    it("10. bulkUpdateStatus (via updateApplication) creates FOLLOW_UP", async () => {
      const session = await loginSession(app);
      const a = await createApp(session);
      const b = await createApp(session);
      const res = await app.inject({
        method: "POST",
        url: "/api/applications/board/bulk-status",
        headers: mutHeaders(session),
        payload: { ids: [a.id, b.id], toStatus: "APPLIED" },
      });
      expect(res.statusCode).toBe(200);
      for (const id of [a.id, b.id]) {
        const rows = await followUps(id);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.status).toBe("SCHEDULED");
        await expectJobExists(rows[0]!.bullJobId);
      }
    });
  });
});

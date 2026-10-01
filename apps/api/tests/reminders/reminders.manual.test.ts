import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { resetDb } from "../helpers/db.js";
import { createApplicationFor, loginSession } from "../helpers/interviews.js";
import {
  closeQueueAfterTests,
  csrfHeaders,
  expectJobExists,
  expectJobGone,
  futureIso,
  noCsrfHeaders,
  resetReminderQueue,
  seedReminder,
} from "../helpers/reminders.js";

describe("MANUAL reminders HTTP", () => {
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

  async function setup() {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    return { session, application };
  }

  const createUrl = (appId: string) => `/api/applications/${appId}/reminders`;

  async function createManual(
    session: Awaited<ReturnType<typeof loginSession>>,
    applicationId: string,
    payload: Record<string, unknown> = {},
  ) {
    const res = await app.inject({
      method: "POST",
      url: createUrl(applicationId),
      headers: csrfHeaders(session),
      payload: { title: "Call recruiter", dueAt: futureIso(60), ...payload },
    });
    return res;
  }

  it("POST creates MANUAL SCHEDULED + job present", async () => {
    const { session, application } = await setup();
    const dueAt = futureIso(60);
    const res = await createManual(session, application.id, {
      title: "  Call recruiter ",
      body: "ask about salary",
      dueAt,
    });
    expect(res.statusCode).toBe(201);
    const dto = res.json();
    expect(dto).toMatchObject({
      applicationId: application.id,
      kind: "MANUAL",
      title: "Call recruiter",
      body: "ask about salary",
      status: "SCHEDULED",
      interviewId: null,
      firedAt: null,
    });
    expect(new Date(dto.dueAt).toISOString()).toBe(
      new Date(dueAt).toISOString(),
    );
    const row = await prisma.reminder.findUniqueOrThrow({
      where: { id: dto.id },
    });
    expect(row.bullJobId).toBe(`reminder-${row.id}-${row.dueAt.getTime()}`);
    await expectJobExists(row.bullJobId);
  });

  it("POST on other user's application → 404", async () => {
    const a = await setup();
    const b = await loginSession(app);
    const res = await createManual(b, a.application.id);
    expect(res.statusCode).toBe(404);
  });

  it("POST past dueAt → 400 VALIDATION_ERROR; bad body → 400", async () => {
    const { session, application } = await setup();
    const past = await createManual(session, application.id, {
      dueAt: futureIso(-5),
    });
    expect(past.statusCode).toBe(400);
    expect(past.json().error.code).toBe("VALIDATION_ERROR");
    const noTitle = await createManual(session, application.id, {
      title: "  ",
    });
    expect(noTitle.statusCode).toBe(400);
    expect(await prisma.reminder.count()).toBe(0);
  });

  it("GET lists user-scoped with application summary, dueAt asc, filters", async () => {
    const a = await setup();
    const b = await setup();
    const later = await createManual(a.session, a.application.id, {
      title: "later",
      dueAt: futureIso(120),
    });
    const sooner = await createManual(a.session, a.application.id, {
      title: "sooner",
      dueAt: futureIso(30),
    });
    await createManual(b.session, b.application.id, { title: "theirs" });
    await seedReminder({
      userId: a.session.user.id,
      applicationId: a.application.id,
      status: "DUE",
      title: "due one",
      dueAt: new Date(Date.now() - 60_000),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/reminders",
      headers: { Cookie: a.session.cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{
      id: string;
      title: string;
      application?: unknown;
    }>;
    expect(items.map((i) => i.title)).toEqual(["due one", "sooner", "later"]);
    expect(items[1]!.id).toBe(sooner.json().id);
    expect(items[2]!.id).toBe(later.json().id);
    expect(items[0]!.application).toEqual({
      id: a.application.id,
      company: "Co",
      title: "Role",
    });

    const due = await app.inject({
      method: "GET",
      url: "/api/reminders?status=DUE,DISMISSED",
      headers: { Cookie: a.session.cookieHeader },
    });
    expect(due.json().items.map((i: { title: string }) => i.title)).toEqual([
      "due one",
    ]);

    const limited = await app.inject({
      method: "GET",
      url: `/api/reminders?limit=1&applicationId=${a.application.id}`,
      headers: { Cookie: a.session.cookieHeader },
    });
    expect(limited.json().items).toHaveLength(1);

    const badStatus = await app.inject({
      method: "GET",
      url: "/api/reminders?status=NOPE",
      headers: { Cookie: a.session.cookieHeader },
    });
    expect(badStatus.statusCode).toBe(400);
    const badLimit = await app.inject({
      method: "GET",
      url: "/api/reminders?limit=51",
      headers: { Cookie: a.session.cookieHeader },
    });
    expect(badLimit.statusCode).toBe(400);
  });

  it("PATCH dueAt/title → new bullJobId; old job gone", async () => {
    const { session, application } = await setup();
    const created = (await createManual(session, application.id)).json();
    const before = await prisma.reminder.findUniqueOrThrow({
      where: { id: created.id },
    });
    const newDue = futureIso(180);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${created.id}`,
      headers: csrfHeaders(session),
      payload: { title: "Renamed", dueAt: newDue },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: created.id, title: "Renamed" });
    const after = await prisma.reminder.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.bullJobId).not.toBe(before.bullJobId);
    expect(after.bullJobId).toBe(
      `reminder-${after.id}-${after.dueAt.getTime()}`,
    );
    await expectJobGone(before.bullJobId);
    await expectJobExists(after.bullJobId);
  });

  it("PATCH title-only on SCHEDULED with null bullJobId → enqueues (repair)", async () => {
    const { session, application } = await setup();
    const r = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
    });
    expect(r.bullJobId).toBeNull();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${r.id}`,
      headers: csrfHeaders(session),
      payload: { title: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
    const row = await prisma.reminder.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(row.title).toBe("Renamed");
    await expectJobExists(row.bullJobId);
  });

  it("PATCH past dueAt → 400; empty body → 400; other user → 404", async () => {
    const { session, application } = await setup();
    const created = (await createManual(session, application.id)).json();
    const past = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${created.id}`,
      headers: csrfHeaders(session),
      payload: { dueAt: futureIso(-5) },
    });
    expect(past.statusCode).toBe(400);
    expect(past.json().error.code).toBe("VALIDATION_ERROR");
    const empty = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${created.id}`,
      headers: csrfHeaders(session),
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
    const other = await loginSession(app);
    const foreign = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${created.id}`,
      headers: csrfHeaders(other),
      payload: { title: "x" },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("PATCH status DISMISSED → DISMISSED + activity; job removed; idempotent", async () => {
    const { session, application } = await setup();
    const created = (await createManual(session, application.id)).json();
    const before = await prisma.reminder.findUniqueOrThrow({
      where: { id: created.id },
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${created.id}`,
      headers: csrfHeaders(session),
      payload: { status: "DISMISSED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("DISMISSED");
    await expectJobGone(before.bullJobId);
    const acts = await prisma.activity.findMany({
      where: { applicationId: application.id, type: "REMINDER_DISMISSED" },
    });
    expect(acts).toHaveLength(1);
    expect(acts[0]!.payload).toEqual({
      reminderId: created.id,
      kind: "MANUAL",
      title: "Call recruiter",
    });

    const again = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${created.id}`,
      headers: csrfHeaders(session),
      payload: { status: "DISMISSED" },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe("DISMISSED");
    expect(
      await prisma.activity.count({ where: { type: "REMINDER_DISMISSED" } }),
    ).toBe(1);
  });

  it("PATCH dismiss works on DUE; field edit on DUE → 400", async () => {
    const { session, application } = await setup();
    const due = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      status: "DUE",
      dueAt: new Date(Date.now() - 1000),
    });
    const edit = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${due.id}`,
      headers: csrfHeaders(session),
      payload: { title: "nope" },
    });
    expect(edit.statusCode).toBe(400);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${due.id}`,
      headers: csrfHeaders(session),
      payload: { status: "DISMISSED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("DISMISSED");
  });

  it("DELETE MANUAL → 204 CANCELLED + job removed", async () => {
    const { session, application } = await setup();
    const created = (await createManual(session, application.id)).json();
    const before = await prisma.reminder.findUniqueOrThrow({
      where: { id: created.id },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/reminders/${created.id}`,
      headers: csrfHeaders(session),
    });
    expect(res.statusCode).toBe(204);
    const row = await prisma.reminder.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.status).toBe("CANCELLED");
    await expectJobGone(before.bullJobId);
  });

  it("DELETE INTERVIEW kind → 400; other user → 404", async () => {
    const { session, application } = await setup();
    const auto = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
      kind: "FOLLOW_UP",
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/reminders/${auto.id}`,
      headers: csrfHeaders(session),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(
      (await prisma.reminder.findUniqueOrThrow({ where: { id: auto.id } }))
        .status,
    ).toBe("SCHEDULED");

    const manual = await seedReminder({
      userId: session.user.id,
      applicationId: application.id,
    });
    const other = await loginSession(app);
    const foreign = await app.inject({
      method: "DELETE",
      url: `/api/reminders/${manual.id}`,
      headers: csrfHeaders(other),
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("401 unauthenticated", async () => {
    const { session, application } = await setup();
    const csrfOnly = {
      Origin: "http://localhost:5173",
    };
    const list = await app.inject({ method: "GET", url: "/api/reminders" });
    expect(list.statusCode).toBe(401);
    // mutations: send valid csrf pair but no auth cookie
    const csrf = session.cookies.csrf_token!;
    const hdr = {
      ...csrfOnly,
      Cookie: `csrf_token=${csrf}`,
      "X-CSRF-Token": csrf,
    };
    const post = await app.inject({
      method: "POST",
      url: createUrl(application.id),
      headers: hdr,
      payload: { title: "x", dueAt: futureIso(10) },
    });
    expect(post.statusCode).toBe(401);
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/reminders/abc",
      headers: hdr,
      payload: { title: "x" },
    });
    expect(patch.statusCode).toBe(401);
    const del = await app.inject({
      method: "DELETE",
      url: "/api/reminders/abc",
      headers: hdr,
    });
    expect(del.statusCode).toBe(401);
  });

  it("POST/PATCH/DELETE without CSRF header → 403 CSRF_INVALID", async () => {
    const { session, application } = await setup();
    const created = (await createManual(session, application.id)).json();
    const post = await app.inject({
      method: "POST",
      url: createUrl(application.id),
      headers: noCsrfHeaders(session),
      payload: { title: "x", dueAt: futureIso(10) },
    });
    expect(post.statusCode).toBe(403);
    expect(post.json().error.code).toBe("CSRF_INVALID");
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/reminders/${created.id}`,
      headers: noCsrfHeaders(session),
      payload: { title: "x" },
    });
    expect(patch.statusCode).toBe(403);
    expect(patch.json().error.code).toBe("CSRF_INVALID");
    const del = await app.inject({
      method: "DELETE",
      url: `/api/reminders/${created.id}`,
      headers: noCsrfHeaders(session),
    });
    expect(del.statusCode).toBe(403);
    expect(del.json().error.code).toBe("CSRF_INVALID");
  });

  it("application delete removes reminder rows + jobs", async () => {
    const { session, application } = await setup();
    const created = (await createManual(session, application.id)).json();
    const row = await prisma.reminder.findUniqueOrThrow({
      where: { id: created.id },
    });
    await expectJobExists(row.bullJobId);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/applications/${application.id}`,
      headers: csrfHeaders(session),
    });
    expect(res.statusCode).toBe(204);
    expect(await prisma.reminder.count()).toBe(0);
    await expectJobGone(row.bullJobId);
  });
});

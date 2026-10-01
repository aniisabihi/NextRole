import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { resetDb } from "../helpers/db.js";
import { TEST_ORIGIN } from "../helpers/http.js";
import {
  createApplicationFor,
  isoOffset,
  loginSession,
  mutHeaders,
} from "../helpers/interviews.js";

describe("interviews HTTP: create/list", () => {
  let app: FastifyInstance;
  const prevMax = process.env.AUTH_RATE_LIMIT_MAX;

  beforeAll(async () => {
    // File registers >20 users; default auth limit (20/min) would 429.
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (prevMax === undefined) {
      delete process.env.AUTH_RATE_LIMIT_MAX;
    } else {
      process.env.AUTH_RATE_LIMIT_MAX = prevMax;
    }
  });

  const url = (appId: string) => `/api/applications/${appId}/interviews`;

  async function setup() {
    const session = await loginSession(app);
    const application = await createApplicationFor(app, session);
    return { session, application };
  }

  it("POST 201 + INTERVIEW_CREATED payload snapshot", async () => {
    const { session, application } = await setup();
    const scheduledAt = isoOffset(120);
    const res = await app.inject({
      method: "POST",
      url: url(application.id),
      headers: mutHeaders(session),
      payload: {
        scheduledAt,
        type: "OTHER",
        typeLabel: "  Panel  ",
        interviewer: " Jane ",
        locationOrUrl: "https://meet.example.com/x",
        notes: "bring laptop",
      },
    });
    expect(res.statusCode).toBe(201);
    const { interview } = res.json();
    expect(interview.status).toBe("SCHEDULED");
    expect(interview.typeLabel).toBe("Panel");
    expect(interview.interviewer).toBe("Jane");

    const activity = await prisma.activity.findFirstOrThrow({
      where: { applicationId: application.id, type: "INTERVIEW_CREATED" },
    });
    expect(activity.payload).toEqual({
      interviewId: interview.id,
      interviewType: "OTHER",
      typeLabel: "Panel",
      status: "SCHEDULED",
      scheduledAt: new Date(scheduledAt).toISOString(),
      interviewer: "Jane",
      locationOrUrl: "https://meet.example.com/x",
      notes: "bring laptop",
    });
  });

  it("strips status on create → still SCHEDULED", async () => {
    const { session, application } = await setup();
    const res = await app.inject({
      method: "POST",
      url: url(application.id),
      headers: mutHeaders(session),
      payload: {
        scheduledAt: isoOffset(),
        type: "PHONE",
        status: "COMPLETED",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().interview.status).toBe("SCHEDULED");
  });

  it("OTHER without typeLabel → 400", async () => {
    const { session, application } = await setup();
    const res = await app.inject({
      method: "POST",
      url: url(application.id),
      headers: mutHeaders(session),
      payload: { scheduledAt: isoOffset(), type: "OTHER" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("OTHER with whitespace typeLabel → 400", async () => {
    const { session, application } = await setup();
    const res = await app.inject({
      method: "POST",
      url: url(application.id),
      headers: mutHeaders(session),
      payload: { scheduledAt: isoOffset(), type: "OTHER", typeLabel: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("offset-less scheduledAt → 400", async () => {
    const { session, application } = await setup();
    const res = await app.inject({
      method: "POST",
      url: url(application.id),
      headers: mutHeaders(session),
      payload: { scheduledAt: "2026-10-01T12:00:00", type: "PHONE" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("date-only scheduledAt → 400", async () => {
    const { session, application } = await setup();
    const res = await app.inject({
      method: "POST",
      url: url(application.id),
      headers: mutHeaders(session),
      payload: { scheduledAt: "2026-10-01", type: "PHONE" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("51st interview → 400 INTERVIEW_LIMIT_EXCEEDED", async () => {
    const { session, application } = await setup();
    await prisma.interview.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + i * 60_000),
        type: "PHONE" as const,
      })),
    });
    const res = await app.inject({
      method: "POST",
      url: url(application.id),
      headers: mutHeaders(session),
      payload: { scheduledAt: isoOffset(), type: "PHONE" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INTERVIEW_LIMIT_EXCEEDED");
  });

  it("GET sorted by scheduledAt asc, id asc", async () => {
    const { session, application } = await setup();
    const later = isoOffset(300);
    const earlier = isoOffset(60);
    for (const scheduledAt of [later, earlier]) {
      const res = await app.inject({
        method: "POST",
        url: url(application.id),
        headers: mutHeaders(session),
        payload: { scheduledAt, type: "PHONE" },
      });
      expect(res.statusCode).toBe(201);
    }
    // tie on scheduledAt → id asc
    const tie = isoOffset(600);
    const tieIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "POST",
        url: url(application.id),
        headers: mutHeaders(session),
        payload: { scheduledAt: tie, type: "PHONE" },
      });
      tieIds.push(res.json().interview.id);
    }

    const res = await app.inject({
      method: "GET",
      url: url(application.id),
      headers: { Cookie: session.cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as { id: string; scheduledAt: string }[];
    expect(items).toHaveLength(5);
    expect(items[0]!.scheduledAt).toBe(new Date(earlier).toISOString());
    expect(items[1]!.scheduledAt).toBe(new Date(later).toISOString());
    expect(items.slice(2).map((i) => i.id)).toEqual([...tieIds].sort());
  });

  it("cross-user GET → 404", async () => {
    const { application } = await setup();
    const other = await loginSession(app);
    const res = await app.inject({
      method: "GET",
      url: url(application.id),
      headers: { Cookie: other.cookieHeader },
    });
    expect(res.statusCode).toBe(404);
  });

  it("unauthenticated GET → 401", async () => {
    const { application } = await setup();
    const res = await app.inject({ method: "GET", url: url(application.id) });
    expect(res.statusCode).toBe(401);
  });

  it("missing CSRF on POST → 403", async () => {
    const { session, application } = await setup();
    const res = await app.inject({
      method: "POST",
      url: url(application.id),
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: session.cookieHeader,
        "Content-Type": "application/json",
      },
      payload: { scheduledAt: isoOffset(), type: "PHONE" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/applications/:id still 200 after interviews plugin registered", async () => {
    const { session, application } = await setup();
    const res = await app.inject({
      method: "GET",
      url: `/api/applications/${application.id}`,
      headers: { Cookie: session.cookieHeader },
    });
    expect(res.statusCode).toBe(200);
  });
  describe("PATCH", () => {
    async function createInterview(
      session: Awaited<ReturnType<typeof loginSession>>,
      appId: string,
      payload: Record<string, unknown> = {},
    ) {
      const res = await app.inject({
        method: "POST",
        url: url(appId),
        headers: mutHeaders(session),
        payload: { scheduledAt: isoOffset(120), type: "PHONE", ...payload },
      });
      expect(res.statusCode).toBe(201);
      return res.json().interview as {
        id: string;
        scheduledAt: string;
        status: string;
        typeLabel: string | null;
      };
    }

    function patch(
      session: Awaited<ReturnType<typeof loginSession>>,
      appId: string,
      id: string,
      payload: Record<string, unknown>,
    ) {
      return app.inject({
        method: "PATCH",
        url: `${url(appId)}/${id}`,
        headers: mutHeaders(session),
        payload,
      });
    }

    it("PATCH status SCHEDULED→COMPLETED + STATUS_CHANGED activity", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      const res = await patch(session, application.id, iv.id, {
        status: "COMPLETED",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().interview.status).toBe("COMPLETED");
      const acts = await prisma.activity.findMany({
        where: {
          applicationId: application.id,
          type: { in: ["INTERVIEW_STATUS_CHANGED", "INTERVIEW_UPDATED"] },
        },
      });
      expect(acts).toHaveLength(1);
      expect(acts[0]!.type).toBe("INTERVIEW_STATUS_CHANGED");
      expect(acts[0]!.payload).toEqual({
        interviewId: iv.id,
        from: "SCHEDULED",
        to: "COMPLETED",
      });
    });

    it("PATCH status+notes → both STATUS_CHANGED and UPDATED activities", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      const res = await patch(session, application.id, iv.id, {
        status: "COMPLETED",
        notes: "went well",
      });
      expect(res.statusCode).toBe(200);
      const acts = await prisma.activity.findMany({
        where: {
          applicationId: application.id,
          type: { in: ["INTERVIEW_STATUS_CHANGED", "INTERVIEW_UPDATED"] },
        },
      });
      expect(acts.map((a) => a.type).sort()).toEqual([
        "INTERVIEW_STATUS_CHANGED",
        "INTERVIEW_UPDATED",
      ]);
      const updated = acts.find((a) => a.type === "INTERVIEW_UPDATED")!;
      expect(updated.payload).toEqual({
        interviewId: iv.id,
        fields: { notes: { from: null, to: "went well" } },
      });
    });

    it("reopen COMPLETED→SCHEDULED → 400 INVALID_INTERVIEW_STATUS_TRANSITION", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      await prisma.interview.update({
        where: { id: iv.id },
        data: { status: "COMPLETED" },
      });
      const res = await patch(session, application.id, iv.id, {
        status: "SCHEDULED",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_INTERVIEW_STATUS_TRANSITION");
    });

    it("terminal→terminal CANCELLED→NO_SHOW → 400", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      await prisma.interview.update({
        where: { id: iv.id },
        data: { status: "CANCELLED" },
      });
      const res = await patch(session, application.id, iv.id, {
        status: "NO_SHOW",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_INTERVIEW_STATUS_TRANSITION");
    });

    it("terminal + scheduledAt → 400 INTERVIEW_TERMINAL_FIELDS_LOCKED", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      await prisma.interview.update({
        where: { id: iv.id },
        data: { status: "COMPLETED" },
      });
      const res = await patch(session, application.id, iv.id, {
        scheduledAt: isoOffset(500),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INTERVIEW_TERMINAL_FIELDS_LOCKED");
    });

    it("terminal + notes ok", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      await prisma.interview.update({
        where: { id: iv.id },
        data: { status: "COMPLETED" },
      });
      const res = await patch(session, application.id, iv.id, {
        notes: "post-mortem",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().interview.notes).toBe("post-mortem");
    });

    it('PATCH type OTHER with typeLabel:"" clearing prior label → 400', async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id, {
        type: "OTHER",
        typeLabel: "Panel",
      });
      const res = await patch(session, application.id, iv.id, {
        type: "OTHER",
        typeLabel: "",
      });
      expect(res.statusCode).toBe(400);
    });

    it("PATCH type PHONE from OTHER clears typeLabel in UPDATED diff", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id, {
        type: "OTHER",
        typeLabel: "Panel",
      });
      const res = await patch(session, application.id, iv.id, {
        type: "PHONE",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().interview.typeLabel).toBeNull();
      const act = await prisma.activity.findFirstOrThrow({
        where: { applicationId: application.id, type: "INTERVIEW_UPDATED" },
      });
      expect(act.payload).toEqual({
        interviewId: iv.id,
        fields: {
          type: { from: "OTHER", to: "PHONE" },
          typeLabel: { from: "Panel", to: null },
        },
      });
    });

    it("empty PATCH {} → 400", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      const res = await patch(session, application.id, iv.id, {});
      expect(res.statusCode).toBe(400);
    });

    it("no-op PATCH same scheduledAt minute → 200 no new activity", async () => {
      const { session, application } = await setup();
      const base = new Date("2030-01-01T10:00:10.000Z");
      const iv = await createInterview(session, application.id, {
        scheduledAt: base.toISOString(),
      });
      const before = await prisma.activity.count({
        where: { applicationId: application.id },
      });
      const res = await patch(session, application.id, iv.id, {
        scheduledAt: "2030-01-01T10:00:45.000Z",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().interview.scheduledAt).toBe(base.toISOString());
      const after = await prisma.activity.count({
        where: { applicationId: application.id },
      });
      expect(after).toBe(before);
    });

    it("wrong-app interview id → 404", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      const otherApp = await createApplicationFor(app, session);
      const res = await patch(session, otherApp.id, iv.id, { notes: "x" });
      expect(res.statusCode).toBe(404);
    });

    it("cross-user PATCH → 404", async () => {
      const { session, application } = await setup();
      const iv = await createInterview(session, application.id);
      const other = await loginSession(app);
      const res = await patch(other, application.id, iv.id, { notes: "x" });
      expect(res.statusCode).toBe(404);
    });
  });
});

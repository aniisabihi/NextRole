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

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
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
});

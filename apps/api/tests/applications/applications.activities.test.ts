import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { resetDb } from "../helpers/db.js";
import { TEST_ORIGIN } from "../helpers/http.js";
import { registerAndLogin } from "../helpers/applications.js";

function mutationHeaders(session: Awaited<ReturnType<typeof registerAndLogin>>) {
  return {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
    "X-CSRF-Token": session.cookies.csrf_token!,
  };
}

describe("applications HTTP: activities", () => {
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

  async function createApp(
    session: Awaited<ReturnType<typeof registerAndLogin>>,
    payload: Record<string, unknown> = { company: "Acme", title: "Eng" },
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json().application as { id: string };
  }

  it("creates APPLICATION_CREATED on create", async () => {
    const session = await registerAndLogin(app);
    const { id } = await createApp(session, {
      company: "Acme",
      title: "Backend Engineer",
    });

    const activities = await prisma.activity.findMany({
      where: { applicationId: id },
    });
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: "APPLICATION_CREATED",
      userId: session.user.id,
      payload: {
        company: "Acme",
        title: "Backend Engineer",
        status: "SAVED",
      },
    });
  });

  it("records STATUS_CHANGED on status PATCH", async () => {
    const session = await registerAndLogin(app);
    const { id } = await createApp(session);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { status: "APPLIED" },
    });
    expect(patchRes.statusCode).toBe(200);

    const activities = await prisma.activity.findMany({
      where: { applicationId: id, type: "STATUS_CHANGED" },
    });
    expect(activities).toHaveLength(1);
    expect(activities[0]!.payload).toEqual({ from: "SAVED", to: "APPLIED" });
  });

  it("records FIELDS_UPDATED without status key on field PATCH", async () => {
    const session = await registerAndLogin(app);
    const { id } = await createApp(session);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { notes: "Follow up Friday", workplaceType: "HYBRID" },
    });
    expect(patchRes.statusCode).toBe(200);

    const activities = await prisma.activity.findMany({
      where: { applicationId: id, type: "FIELDS_UPDATED" },
    });
    expect(activities).toHaveLength(1);
    const payload = activities[0]!.payload as {
      fields: Record<string, { from: unknown; to: unknown }>;
    };
    expect(payload.fields).toMatchObject({
      notes: { from: null, to: "Follow up Friday" },
      workplaceType: { from: null, to: "HYBRID" },
    });
    expect(payload.fields).not.toHaveProperty("status");
  });

  it("records both activity types on combined PATCH", async () => {
    const session = await registerAndLogin(app);
    const { id } = await createApp(session);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { status: "APPLIED", notes: "Sent" },
    });
    expect(patchRes.statusCode).toBe(200);

    const activities = await prisma.activity.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: "asc" },
    });
    const types = activities.map((a) => a.type);
    expect(types).toContain("APPLICATION_CREATED");
    expect(types).toContain("STATUS_CHANGED");
    expect(types).toContain("FIELDS_UPDATED");

    const statusAct = activities.find((a) => a.type === "STATUS_CHANGED");
    const fieldsAct = activities.find((a) => a.type === "FIELDS_UPDATED");
    expect(statusAct!.payload).toEqual({ from: "SAVED", to: "APPLIED" });
    expect(fieldsAct!.payload).toEqual({
      fields: { notes: { from: null, to: "Sent" } },
    });
  });

  it("lists activities newest-first via API", async () => {
    const session = await registerAndLogin(app);
    const { id } = await createApp(session);

    await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { notes: "a" },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { status: "APPLIED" },
    });

    const listRes = await app.inject({
      method: "GET",
      url: `/api/applications/${id}/activities`,
      headers: { Cookie: session.cookieHeader },
    });

    expect(listRes.statusCode).toBe(200);
    const { items } = listRes.json() as {
      items: Array<{ type: string; createdAt: string }>;
    };
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < items.length; i++) {
      expect(
        new Date(items[i - 1]!.createdAt).getTime(),
      ).toBeGreaterThanOrEqual(new Date(items[i]!.createdAt).getTime());
    }
  });

  it("returns 404 for another user's activities", async () => {
    const owner = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const { id } = await createApp(owner);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/applications/${id}/activities`,
      headers: { Cookie: other.cookieHeader },
    });
    expect(listRes.statusCode).toBe(404);
  });
});

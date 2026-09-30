import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { resetDb } from "../helpers/db.js";
import { TEST_ORIGIN } from "../helpers/http.js";
import { registerAndLogin } from "../helpers/applications.js";

describe("applications HTTP: create → get", () => {
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

  it("creates application then gets by id", async () => {
    const session = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: session.cookieHeader,
        "X-CSRF-Token": session.cookies.csrf_token!,
      },
      payload: {
        company: "Acme",
        title: "Backend Engineer",
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.application).toMatchObject({
      company: "Acme",
      title: "Backend Engineer",
      status: "SAVED",
      priority: "MEDIUM",
      priorityRank: 2,
      userId: session.user.id,
    });
    expect(created.application.id).toBeTruthy();

    const getRes = await app.inject({
      method: "GET",
      url: `/api/applications/${created.application.id}`,
      headers: {
        Cookie: session.cookieHeader,
      },
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().application).toMatchObject({
      id: created.application.id,
      company: "Acme",
      title: "Backend Engineer",
      userId: session.user.id,
    });

    const activities = await prisma.activity.findMany({
      where: { applicationId: created.application.id },
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

  it("returns 404 NOT_FOUND for another user's application", async () => {
    const owner = await registerAndLogin(app);
    const other = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: owner.cookieHeader,
        "X-CSRF-Token": owner.cookies.csrf_token!,
      },
      payload: {
        company: "Secret Co",
        title: "Hidden Role",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const id = createRes.json().application.id as string;

    const getRes = await app.inject({
      method: "GET",
      url: `/api/applications/${id}`,
      headers: {
        Cookie: other.cookieHeader,
      },
    });

    expect(getRes.statusCode).toBe(404);
    expect(getRes.json().error.code).toBe("NOT_FOUND");
  });
});

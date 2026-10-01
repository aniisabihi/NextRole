import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { resetDb } from "../helpers/db.js";
import { TEST_ORIGIN } from "../helpers/http.js";
import { registerAndLogin } from "../helpers/applications.js";

function mutationHeaders(
  session: Awaited<ReturnType<typeof registerAndLogin>>,
) {
  return {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
    "X-CSRF-Token": session.cookies.csrf_token!,
  };
}

describe("applications HTTP: list", () => {
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
    payload: Record<string, unknown>,
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

  it("filters by q, status, workplaceType and paginates", async () => {
    const session = await registerAndLogin(app);

    await createApp(session, {
      company: "Acme Corp",
      title: "Backend Engineer",
      status: "APPLIED",
      workplaceType: "REMOTE",
    });
    await createApp(session, {
      company: "Beta Inc",
      title: "Frontend",
      status: "SAVED",
      workplaceType: "HYBRID",
    });
    await createApp(session, {
      company: "Acme Labs",
      title: "Platform",
      status: "APPLIED",
      workplaceType: "REMOTE",
    });

    const qRes = await app.inject({
      method: "GET",
      url: "/api/applications?q=acme",
      headers: { Cookie: session.cookieHeader },
    });
    expect(qRes.statusCode).toBe(200);
    const qBody = qRes.json();
    expect(qBody.total).toBe(2);
    expect(qBody.items).toHaveLength(2);
    expect(qBody.page).toBe(1);
    expect(qBody.pageSize).toBe(20);

    const statusRes = await app.inject({
      method: "GET",
      url: "/api/applications?status=APPLIED",
      headers: { Cookie: session.cookieHeader },
    });
    expect(statusRes.json().total).toBe(2);

    const workplaceRes = await app.inject({
      method: "GET",
      url: "/api/applications?workplaceType=REMOTE",
      headers: { Cookie: session.cookieHeader },
    });
    expect(workplaceRes.json().total).toBe(2);

    const pageRes = await app.inject({
      method: "GET",
      url: "/api/applications?page=1&pageSize=2&sort=createdAt&order=asc",
      headers: { Cookie: session.cookieHeader },
    });
    const pageBody = pageRes.json();
    expect(pageBody.total).toBe(3);
    expect(pageBody.items).toHaveLength(2);
    expect(pageBody.page).toBe(1);
    expect(pageBody.pageSize).toBe(2);

    const page2 = await app.inject({
      method: "GET",
      url: "/api/applications?page=2&pageSize=2&sort=createdAt&order=asc",
      headers: { Cookie: session.cookieHeader },
    });
    expect(page2.json().items).toHaveLength(1);
  });

  it("sorts by priority via priorityRank", async () => {
    const session = await registerAndLogin(app);

    await createApp(session, {
      company: "Low Co",
      title: "A",
      priority: "LOW",
    });
    await createApp(session, {
      company: "High Co",
      title: "B",
      priority: "HIGH",
    });
    await createApp(session, {
      company: "Med Co",
      title: "C",
      priority: "MEDIUM",
    });

    const ascRes = await app.inject({
      method: "GET",
      url: "/api/applications?sort=priority&order=asc",
      headers: { Cookie: session.cookieHeader },
    });
    expect(ascRes.statusCode).toBe(200);
    const ascItems = ascRes.json().items as Array<{
      priority: string;
      company: string;
    }>;
    expect(ascItems.map((i) => i.priority)).toEqual(["LOW", "MEDIUM", "HIGH"]);

    const descRes = await app.inject({
      method: "GET",
      url: "/api/applications?sort=priority&order=desc",
      headers: { Cookie: session.cookieHeader },
    });
    const descItems = descRes.json().items as Array<{ priority: string }>;
    expect(descItems.map((i) => i.priority)).toEqual(["HIGH", "MEDIUM", "LOW"]);
  });

  it("scopes list to current user only", async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);

    await createApp(a, { company: "Only A", title: "Role" });
    await createApp(b, { company: "Only B", title: "Role" });

    const listA = await app.inject({
      method: "GET",
      url: "/api/applications",
      headers: { Cookie: a.cookieHeader },
    });
    expect(listA.json().total).toBe(1);
    expect(listA.json().items[0].company).toBe("Only A");
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { resetDb } from "../helpers/db.js";
import { TEST_ORIGIN } from "../helpers/http.js";
import { registerAndLogin } from "../helpers/applications.js";

type Session = Awaited<ReturnType<typeof registerAndLogin>>;

function mutationHeaders(session: Session) {
  return {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
    "X-CSRF-Token": session.cookies.csrf_token!,
  };
}

describe("applications HTTP: board order", () => {
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

  async function createApp(session: Session, payload: Record<string, unknown>) {
    const res = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json().application as { id: string; boardOrder: number };
  }

  it("appends boardOrder within same status+priority cell", async () => {
    const session = await registerAndLogin(app);
    const a = await createApp(session, {
      company: "A",
      title: "T",
      status: "APPLIED",
      priority: "HIGH",
    });
    const b = await createApp(session, {
      company: "B",
      title: "T",
      status: "APPLIED",
      priority: "HIGH",
    });
    const other = await createApp(session, {
      company: "C",
      title: "T",
      status: "APPLIED",
      priority: "LOW",
    });
    expect(a.boardOrder).toBe(0);
    expect(b.boardOrder).toBe(1);
    expect(other.boardOrder).toBe(0);
  });

  it("accepts pageSize=100", async () => {
    const session = await registerAndLogin(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/applications?pageSize=100",
      headers: { Cookie: session.cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pageSize).toBe(100);
  });

  it("rejects pageSize=101", async () => {
    const session = await registerAndLogin(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/applications?pageSize=101",
      headers: { Cookie: session.cookieHeader },
    });
    expect(res.statusCode).toBe(400);
  });
});

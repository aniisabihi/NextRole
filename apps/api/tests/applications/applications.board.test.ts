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

  async function patchApp(
    session: Session,
    id: string,
    payload: Record<string, unknown>,
  ) {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload,
    });
    expect(res.statusCode).toBe(200);
    return res.json().application as {
      id: string;
      boardOrder: number;
      priority: string;
      priorityRank: number;
      status: string;
    };
  }

  it("PATCH status places at end of (newStatus, oldPriority)", async () => {
    const session = await registerAndLogin(app);
    await createApp(session, {
      company: "A",
      title: "T",
      status: "APPLIED",
      priority: "HIGH",
    });
    await createApp(session, {
      company: "B",
      title: "T",
      status: "APPLIED",
      priority: "HIGH",
    });
    const mover = await createApp(session, {
      company: "M",
      title: "T",
      status: "SAVED",
      priority: "HIGH",
    });
    const updated = await patchApp(session, mover.id, { status: "APPLIED" });
    expect(updated.status).toBe("APPLIED");
    expect(updated.boardOrder).toBe(2);
  });

  it("PATCH priority places at end of (oldStatus, newPriority) and updates priorityRank", async () => {
    const session = await registerAndLogin(app);
    await createApp(session, {
      company: "A",
      title: "T",
      status: "APPLIED",
      priority: "LOW",
    });
    const mover = await createApp(session, {
      company: "M",
      title: "T",
      status: "APPLIED",
      priority: "HIGH",
    });
    const updated = await patchApp(session, mover.id, { priority: "LOW" });
    expect(updated.priority).toBe("LOW");
    expect(updated.priorityRank).toBe(1);
    expect(updated.boardOrder).toBe(1);
  });

  it("PATCH status + priority places once at (newStatus, newPriority)", async () => {
    const session = await registerAndLogin(app);
    await createApp(session, {
      company: "A",
      title: "T",
      status: "INTERVIEW",
      priority: "LOW",
    });
    await createApp(session, {
      company: "B",
      title: "T",
      status: "INTERVIEW",
      priority: "LOW",
    });
    const mover = await createApp(session, {
      company: "M",
      title: "T",
      status: "SAVED",
      priority: "HIGH",
    });
    const updated = await patchApp(session, mover.id, {
      status: "INTERVIEW",
      priority: "LOW",
    });
    expect(updated.status).toBe("INTERVIEW");
    expect(updated.priority).toBe("LOW");
    expect(updated.priorityRank).toBe(1);
    expect(updated.boardOrder).toBe(2);
  });

  it("same-status no-op PATCH leaves boardOrder unchanged", async () => {
    const session = await registerAndLogin(app);
    await createApp(session, {
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
    const updated = await patchApp(session, b.id, {
      status: "APPLIED",
      priority: "HIGH",
    });
    expect(updated.boardOrder).toBe(b.boardOrder);
  });

  it("non-cell PATCH leaves boardOrder unchanged", async () => {
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
    const updated = await patchApp(session, a.id, { notes: "hello" });
    expect(updated.boardOrder).toBe(a.boardOrder);
    expect(b.boardOrder).toBe(1);
  });

  it("delete leaves sibling boardOrder gaps", async () => {
    const session = await registerAndLogin(app);
    await createApp(session, {
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
    const c = await createApp(session, {
      company: "C",
      title: "T",
      status: "APPLIED",
      priority: "HIGH",
    });
    const del = await app.inject({
      method: "DELETE",
      url: `/api/applications/${b.id}`,
      headers: mutationHeaders(session),
    });
    expect(del.statusCode).toBe(204);
    const rows = await prisma.application.findMany({
      where: { id: c.id },
      select: { boardOrder: true },
    });
    expect(rows[0]?.boardOrder).toBe(2);
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

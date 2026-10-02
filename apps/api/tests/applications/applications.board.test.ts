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

  describe("POST /board/reorder", () => {
    function reorder(session: Session, payload: Record<string, unknown>) {
      return app.inject({
        method: "POST",
        url: "/api/applications/board/reorder",
        headers: mutationHeaders(session),
        payload,
      });
    }

    async function seedCell(session: Session, n: number) {
      const out: { id: string; boardOrder: number }[] = [];
      for (let i = 0; i < n; i++) {
        out.push(
          await createApp(session, {
            company: `C${i}`,
            title: "T",
            status: "SAVED",
            priority: "MEDIUM",
          }),
        );
      }
      return out;
    }

    async function orderOf(id: string) {
      const row = await prisma.application.findUniqueOrThrow({
        where: { id },
        select: { boardOrder: true },
      });
      return row.boardOrder;
    }

    it("reorders cell gaplessly", async () => {
      const session = await registerAndLogin(app);
      const [a, b, c] = await seedCell(session, 3);
      const res = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: [c!.id, a!.id, b!.id],
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(await orderOf(c!.id)).toBe(0);
      expect(await orderOf(a!.id)).toBe(1);
      expect(await orderOf(b!.id)).toBe(2);
    });

    it("renumbers gaps to 0..n-1", async () => {
      const session = await registerAndLogin(app);
      const [a, b, c] = await seedCell(session, 3);
      await app.inject({
        method: "DELETE",
        url: `/api/applications/${b!.id}`,
        headers: mutationHeaders(session),
      });
      expect(await orderOf(c!.id)).toBe(2);
      const res = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: [c!.id, a!.id],
      });
      expect(res.statusCode).toBe(200);
      expect(await orderOf(c!.id)).toBe(0);
      expect(await orderOf(a!.id)).toBe(1);
    });

    it("rejects incomplete set", async () => {
      const session = await registerAndLogin(app);
      const [a, b] = await seedCell(session, 3);
      const res = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: [a!.id, b!.id],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects duplicates", async () => {
      const session = await registerAndLogin(app);
      const [a, b] = await seedCell(session, 2);
      const res = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: [a!.id, a!.id, b!.id],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects foreign id (other user)", async () => {
      const session = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const [a] = await seedCell(session, 1);
      const [foreign] = await seedCell(other, 1);
      const res = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: [a!.id, foreign!.id],
      });
      expect(res.statusCode).toBe(400);
      const res2 = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: [foreign!.id],
      });
      expect(res2.statusCode).toBe(400);
      expect(await orderOf(foreign!.id)).toBe(0);
    });

    it("rejects id from different cell", async () => {
      const session = await registerAndLogin(app);
      const [a] = await seedCell(session, 1);
      const elsewhere = await createApp(session, {
        company: "X",
        title: "T",
        status: "APPLIED",
        priority: "MEDIUM",
      });
      const res = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: [a!.id, elsewhere.id],
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects empty orderedIds", async () => {
      const session = await registerAndLogin(app);
      const res = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: [],
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects missing CSRF", async () => {
      const session = await registerAndLogin(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/applications/board/reorder",
        headers: { Origin: TEST_ORIGIN, Cookie: session.cookieHeader },
        payload: { status: "SAVED", priority: "MEDIUM", orderedIds: ["x"] },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects unauthenticated", async () => {
      const session = await registerAndLogin(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/applications/board/reorder",
        headers: {
          Origin: TEST_ORIGIN,
          Cookie: `csrf_token=${session.cookies.csrf_token}`,
          "X-CSRF-Token": session.cookies.csrf_token!,
        },
        payload: { status: "SAVED", priority: "MEDIUM", orderedIds: ["x"] },
      });
      expect(res.statusCode).toBe(401);
    });

    it("route not shadowed by /:id", async () => {
      const session = await registerAndLogin(app);
      const res = await reorder(session, {
        status: "SAVED",
        priority: "MEDIUM",
        orderedIds: ["missing-id"],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
      expect(res.json().error.code).not.toBe("NOT_FOUND");
    });
  });

  describe("POST /board/bulk-status", () => {
    function bulk(session: Session, payload: Record<string, unknown>) {
      return app.inject({
        method: "POST",
        url: "/api/applications/board/bulk-status",
        headers: mutationHeaders(session),
        payload,
      });
    }

    async function seed(
      session: Session,
      status: string,
      priority: string,
      company: string,
    ) {
      return createApp(session, { company, title: "T", status, priority });
    }

    async function row(id: string) {
      return prisma.application.findUniqueOrThrow({ where: { id } });
    }

    it("mixed move and skip", async () => {
      const session = await registerAndLogin(app);
      const a = await seed(session, "SAVED", "MEDIUM", "A");
      const b = await seed(session, "APPLIED", "MEDIUM", "B");
      const res = await bulk(session, {
        ids: [a.id, b.id, "missing"],
        toStatus: "APPLIED",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.moved.map((m: { id: string }) => m.id)).toEqual([a.id]);
      expect(body.moved[0].status).toBe("APPLIED");
      expect(body.moved[0]).toHaveProperty("nextInterviewAt", null);
      expect(body.skipped).toEqual([
        {
          id: b.id,
          code: "ALREADY_IN_STATUS",
          message: "Already in target status",
        },
        { id: "missing", code: "NOT_FOUND", message: "Application not found" },
      ]);
    });

    it("skips foreign user id as NOT_FOUND", async () => {
      const session = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const foreign = await seed(other, "SAVED", "MEDIUM", "F");
      const res = await bulk(session, {
        ids: [foreign.id],
        toStatus: "APPLIED",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().moved).toEqual([]);
      expect(res.json().skipped[0].code).toBe("NOT_FOUND");
      expect((await row(foreign.id)).status).toBe("SAVED");
    });

    it("skips invalid transition softly", async () => {
      const session = await registerAndLogin(app);
      const a = await seed(session, "REJECTED", "MEDIUM", "A");
      const b = await seed(session, "SAVED", "MEDIUM", "B");
      const res = await bulk(session, {
        ids: [a.id, b.id],
        toStatus: "INTERVIEW",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().moved.map((m: { id: string }) => m.id)).toEqual([b.id]);
      expect(res.json().skipped).toHaveLength(1);
      expect(res.json().skipped[0].id).toBe(a.id);
      expect(res.json().skipped[0].code).toBe("INVALID_STATUS_TRANSITION");
      expect((await row(a.id)).status).toBe("REJECTED");
    });

    it("dedupes ids", async () => {
      const session = await registerAndLogin(app);
      const a = await seed(session, "SAVED", "MEDIUM", "A");
      const b = await seed(session, "SAVED", "MEDIUM", "B");
      const res = await bulk(session, {
        ids: [a.id, a.id, b.id],
        toStatus: "APPLIED",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().moved.map((m: { id: string }) => m.id)).toEqual([
        a.id,
        b.id,
      ]);
      expect(res.json().skipped).toEqual([]);
      const acts = await prisma.activity.findMany({
        where: { applicationId: a.id, type: "STATUS_CHANGED" },
      });
      expect(acts).toHaveLength(1);
    });

    it("activities only for moved", async () => {
      const session = await registerAndLogin(app);
      const a = await seed(session, "SAVED", "MEDIUM", "A");
      const b = await seed(session, "APPLIED", "MEDIUM", "B");
      await bulk(session, { ids: [a.id, b.id], toStatus: "APPLIED" });
      const actsA = await prisma.activity.findMany({
        where: { applicationId: a.id, type: "STATUS_CHANGED" },
      });
      const actsB = await prisma.activity.findMany({
        where: { applicationId: b.id, type: "STATUS_CHANGED" },
      });
      expect(actsA).toHaveLength(1);
      expect(actsB).toHaveLength(0);
    });

    it("preserves priority and places sequentially in target cell", async () => {
      const session = await registerAndLogin(app);
      const existing = await seed(session, "APPLIED", "HIGH", "E");
      const low = await seed(session, "APPLIED", "LOW", "L");
      const h1 = await seed(session, "SAVED", "HIGH", "H1");
      const h2 = await seed(session, "SAVED", "HIGH", "H2");
      const l1 = await seed(session, "SAVED", "LOW", "L1");
      const res = await bulk(session, {
        ids: [h1.id, l1.id, h2.id],
        toStatus: "APPLIED",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().moved).toHaveLength(3);
      const [rExisting, rLow, r1, r2, rl1] = await Promise.all([
        row(existing.id),
        row(low.id),
        row(h1.id),
        row(h2.id),
        row(l1.id),
      ]);
      expect(r1.priority).toBe("HIGH");
      expect(r2.priority).toBe("HIGH");
      expect(rl1.priority).toBe("LOW");
      expect(rExisting.boardOrder).toBe(0);
      expect(r1.boardOrder).toBe(1);
      expect(r2.boardOrder).toBe(2);
      expect(rLow.boardOrder).toBe(0);
      expect(rl1.boardOrder).toBe(1);
    });

    it("rejects empty ids", async () => {
      const session = await registerAndLogin(app);
      const res = await bulk(session, { ids: [], toStatus: "APPLIED" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects more than 100 ids", async () => {
      const session = await registerAndLogin(app);
      const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
      const res = await bulk(session, { ids, toStatus: "APPLIED" });
      expect(res.statusCode).toBe(400);
    });

    it("rejects invalid toStatus", async () => {
      const session = await registerAndLogin(app);
      const res = await bulk(session, { ids: ["x"], toStatus: "NOPE" });
      expect(res.statusCode).toBe(400);
    });

    it("rejects missing CSRF", async () => {
      const session = await registerAndLogin(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/applications/board/bulk-status",
        headers: { Origin: TEST_ORIGIN, Cookie: session.cookieHeader },
        payload: { ids: ["x"], toStatus: "APPLIED" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects unauthenticated", async () => {
      const session = await registerAndLogin(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/applications/board/bulk-status",
        headers: {
          Origin: TEST_ORIGIN,
          Cookie: `csrf_token=${session.cookies.csrf_token}`,
          "X-CSRF-Token": session.cookies.csrf_token!,
        },
        payload: { ids: ["x"], toStatus: "APPLIED" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("route not shadowed by /:id", async () => {
      const session = await registerAndLogin(app);
      const res = await bulk(session, {
        ids: ["missing-id"],
        toStatus: "APPLIED",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().skipped[0].code).toBe("NOT_FOUND");
    });
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

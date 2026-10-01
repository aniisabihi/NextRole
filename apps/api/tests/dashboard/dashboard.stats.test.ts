import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { dashboardStatsSchema } from "../../src/modules/dashboard/schemas.js";
import { resetDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/applications.js";
import { seedApplication, seedInterview } from "../helpers/dashboard.js";

const ALL_STATUSES = [
  "SAVED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mid-month (15th, noon UTC) of the month `back` months before now. */
function midMonth(back: number): Date {
  const n = new Date();
  return new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - back, 15, 12, 0, 0),
  );
}

describe("GET /api/dashboard/stats", () => {
  let app: FastifyInstance;
  const prevMax = process.env.AUTH_RATE_LIMIT_MAX;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (prevMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = prevMax;
  });

  async function getStats(cookie: string) {
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/stats",
      headers: { Cookie: cookie },
    });
    expect(res.statusCode).toBe(200);
    return dashboardStatsSchema.parse(res.json());
  }

  it("401 when unauthenticated", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/stats",
    });
    expect(res.statusCode).toBe(401);
  });

  it("empty user → zeros, 6-month zero series, rates 0", async () => {
    const session = await registerAndLogin(app);
    const stats = await getStats(session.cookieHeader);
    expect(stats.totals).toEqual({ applications: 0, activePipeline: 0 });
    expect(Object.keys(stats.byStatus).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
    expect(Object.values(stats.byStatus).every((n) => n === 0)).toBe(true);
    expect(stats.rates).toEqual({
      offerRate: 0,
      rejectionRate: 0,
      terminalCount: 0,
    });
    expect(stats.interviews).toEqual({ upcoming: 0, completed: 0 });
    expect(stats.monthlyCreated).toHaveLength(6);
    expect(stats.monthlyCreated.every((m) => m.count === 0)).toBe(true);
    expect(stats.monthlyCreated.at(-1)!.month).toBe(monthKey(new Date()));
  });

  it("mixed statuses → byStatus, totals, activePipeline", async () => {
    const { user, cookieHeader } = await registerAndLogin(app);
    const plan: Array<[(typeof ALL_STATUSES)[number], number]> = [
      ["SAVED", 2],
      ["APPLIED", 3],
      ["SCREENING", 1],
      ["INTERVIEW", 1],
      ["OFFER", 1],
      ["REJECTED", 2],
    ];
    for (const [status, n] of plan) {
      for (let i = 0; i < n; i++) {
        await seedApplication({ userId: user.id, status });
      }
    }
    const stats = await getStats(cookieHeader);
    expect(stats.byStatus).toEqual({
      SAVED: 2,
      APPLIED: 3,
      SCREENING: 1,
      INTERVIEW: 1,
      TECHNICAL_INTERVIEW: 0,
      OFFER: 1,
      REJECTED: 2,
      WITHDRAWN: 0,
    });
    expect(stats.totals).toEqual({ applications: 10, activePipeline: 7 });
  });

  it("terminals → offer/rejection rates (WITHDRAWN in denominator)", async () => {
    const { user, cookieHeader } = await registerAndLogin(app);
    // 1 OFFER, 2 REJECTED, 1 WITHDRAWN → terminal 4
    await seedApplication({ userId: user.id, status: "OFFER" });
    await seedApplication({ userId: user.id, status: "REJECTED" });
    await seedApplication({ userId: user.id, status: "REJECTED" });
    await seedApplication({ userId: user.id, status: "WITHDRAWN" });
    await seedApplication({ userId: user.id, status: "APPLIED" });
    const stats = await getStats(cookieHeader);
    expect(stats.rates.terminalCount).toBe(4);
    expect(stats.rates.offerRate).toBeCloseTo(0.25, 10);
    expect(stats.rates.rejectionRate).toBeCloseTo(0.5, 10);
    expect(stats.totals.activePipeline).toBe(1);
  });

  it("only offers → offerRate 1, rejectionRate 0", async () => {
    const { user, cookieHeader } = await registerAndLogin(app);
    await seedApplication({ userId: user.id, status: "OFFER" });
    const stats = await getStats(cookieHeader);
    expect(stats.rates).toEqual({
      offerRate: 1,
      rejectionRate: 0,
      terminalCount: 1,
    });
  });

  it("monthlyCreated buckets by UTC createdAt, oldest → newest", async () => {
    const { user, cookieHeader } = await registerAndLogin(app);
    await seedApplication({ userId: user.id, createdAt: midMonth(0) });
    await seedApplication({ userId: user.id, createdAt: midMonth(0) });
    await seedApplication({ userId: user.id, createdAt: midMonth(2) });
    await seedApplication({ userId: user.id, createdAt: midMonth(5) });
    // outside window (6 months back) → excluded from series, still in totals
    await seedApplication({ userId: user.id, createdAt: midMonth(6) });

    const stats = await getStats(cookieHeader);
    expect(stats.monthlyCreated).toHaveLength(6);
    expect(stats.monthlyCreated.map((m) => m.month)).toEqual(
      [5, 4, 3, 2, 1, 0].map((b) => monthKey(midMonth(b))),
    );
    expect(stats.monthlyCreated.map((m) => m.count)).toEqual([
      1, 0, 0, 1, 0, 2,
    ]);
    expect(stats.totals.applications).toBe(5);
  });

  it("month boundary: first instant of month counts in that month (UTC)", async () => {
    const { user, cookieHeader } = await registerAndLogin(app);
    const n = new Date();
    const first = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
    const lastPrev = new Date(first.getTime() - 1);
    await seedApplication({ userId: user.id, createdAt: first });
    await seedApplication({ userId: user.id, createdAt: lastPrev });
    const stats = await getStats(cookieHeader);
    expect(stats.monthlyCreated.at(-1)!.count).toBe(1);
    expect(stats.monthlyCreated.at(-2)!.count).toBe(1);
  });

  it("interviews: upcoming vs completed", async () => {
    const { user, cookieHeader } = await registerAndLogin(app);
    const a = await seedApplication({ userId: user.id });
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    await seedInterview({ applicationId: a.id, scheduledAt: future });
    await seedInterview({ applicationId: a.id, scheduledAt: future });
    await seedInterview({
      applicationId: a.id,
      scheduledAt: past,
      status: "COMPLETED",
    });
    const stats = await getStats(cookieHeader);
    expect(stats.interviews).toEqual({ upcoming: 2, completed: 1 });
  });

  it("CANCELLED, NO_SHOW, overdue SCHEDULED count in neither", async () => {
    const { user, cookieHeader } = await registerAndLogin(app);
    const a = await seedApplication({ userId: user.id });
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    await seedInterview({
      applicationId: a.id,
      scheduledAt: future,
      status: "CANCELLED",
    });
    await seedInterview({
      applicationId: a.id,
      scheduledAt: past,
      status: "NO_SHOW",
    });
    await seedInterview({
      applicationId: a.id,
      scheduledAt: past,
      status: "SCHEDULED",
    });
    const stats = await getStats(cookieHeader);
    expect(stats.interviews).toEqual({ upcoming: 0, completed: 0 });
  });

  it("excludes other user's data", async () => {
    const mine = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const mineApp = await seedApplication({ userId: mine.user.id });
    const otherApp = await seedApplication({
      userId: other.user.id,
      status: "OFFER",
      createdAt: midMonth(1),
    });
    await seedApplication({ userId: other.user.id, status: "REJECTED" });
    const future = new Date(Date.now() + 86_400_000);
    await seedInterview({ applicationId: otherApp.id, scheduledAt: future });
    await seedInterview({
      applicationId: otherApp.id,
      scheduledAt: future,
      status: "COMPLETED",
    });
    await seedInterview({ applicationId: mineApp.id, scheduledAt: future });

    const stats = await getStats(mine.cookieHeader);
    expect(stats.totals).toEqual({ applications: 1, activePipeline: 1 });
    expect(stats.rates.terminalCount).toBe(0);
    expect(stats.interviews).toEqual({ upcoming: 1, completed: 0 });
    expect(stats.monthlyCreated.reduce((s, m) => s + m.count, 0)).toBe(1);
  });
});

import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { APPLICATION_STATUSES, type DashboardStats } from "./schemas.js";

const MONTHS = 6;

// Terminal = OFFER | REJECTED | WITHDRAWN (denominator for rates).
const TERMINAL: readonly ApplicationStatus[] = [
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
];

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last 6 UTC calendar months (oldest → newest) incl. current; start bound. */
function monthWindow(now: Date): { keys: string[]; start: Date } {
  const keys: string[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    keys.push(
      monthKey(
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)),
      ),
    );
  }
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1),
  );
  return { keys, start };
}

export async function getDashboardStats(
  userId: string,
): Promise<DashboardStats> {
  const now = new Date();
  const { keys, start } = monthWindow(now);

  const [grouped, recent, upcoming, completed] = await Promise.all([
    prisma.application.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where: { userId, createdAt: { gte: start } },
      select: { createdAt: true },
    }),
    // upcoming = SCHEDULED ∧ scheduledAt >= now
    prisma.interview.count({
      where: {
        application: { userId },
        status: "SCHEDULED",
        scheduledAt: { gte: now },
      },
    }),
    // completed = COMPLETED (all time). CANCELLED/NO_SHOW/overdue SCHEDULED in neither.
    prisma.interview.count({
      where: { application: { userId }, status: "COMPLETED" },
    }),
  ]);

  const byStatus = Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s, 0]),
  ) as Record<ApplicationStatus, number>;
  for (const g of grouped) byStatus[g.status] = g._count._all;

  const applications = APPLICATION_STATUSES.reduce(
    (sum, s) => sum + byStatus[s],
    0,
  );
  const terminalCount = TERMINAL.reduce((sum, s) => sum + byStatus[s], 0);
  const activePipeline = applications - terminalCount;

  // offerRate = OFFER / max(1, terminalCount); rejectionRate = REJECTED / same.
  // Both 0 when terminalCount === 0 (numerators are 0 then).
  const denom = Math.max(1, terminalCount);

  const counts = new Map(keys.map((k) => [k, 0]));
  for (const { createdAt } of recent) {
    const k = monthKey(createdAt);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }

  return {
    totals: { applications, activePipeline },
    byStatus,
    rates: {
      offerRate: byStatus.OFFER / denom,
      rejectionRate: byStatus.REJECTED / denom,
      terminalCount,
    },
    interviews: { upcoming, completed },
    monthlyCreated: keys.map((month) => ({ month, count: counts.get(month)! })),
  };
}

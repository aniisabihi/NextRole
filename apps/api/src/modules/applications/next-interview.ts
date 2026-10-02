import { prisma } from "../../db/prisma.js";

/**
 * Attach `nextInterviewAt` (earliest SCHEDULED interview with scheduledAt >= now,
 * UTC ISO string, else null) to each application. One batch query, no N+1.
 *
 * Call from routes only. Callers must pass applications already scoped to the
 * requesting user (ownership is established by the service layer).
 */
export async function attachNextInterviewAt<T extends { id: string }>(
  apps: T[],
  now: Date = new Date(),
): Promise<Array<T & { nextInterviewAt: string | null }>> {
  if (apps.length === 0) return [];

  const interviews = await prisma.interview.findMany({
    where: {
      applicationId: { in: apps.map((a) => a.id) },
      status: "SCHEDULED",
      scheduledAt: { gte: now },
    },
    orderBy: { scheduledAt: "asc" },
    select: { applicationId: true, scheduledAt: true },
  });

  const earliest = new Map<string, string>();
  for (const iv of interviews) {
    if (!earliest.has(iv.applicationId)) {
      earliest.set(iv.applicationId, iv.scheduledAt.toISOString());
    }
  }

  return apps.map((a) => ({
    ...a,
    nextInterviewAt: earliest.get(a.id) ?? null,
  }));
}

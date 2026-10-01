import { prisma } from "../../db/prisma.js";

/** Tolerance for clock drift / timer early-fire between worker and DB `dueAt`. */
export const FIRE_SKEW_MS = 1000;

export type ProcessReminderResult =
  | { outcome: "fired" }
  /** Row exists but nothing to do (already DUE/DISMISSED/CANCELLED, or lost CAS). */
  | { outcome: "noop" }
  /** Row gone (cascade delete); ack. */
  | { outcome: "missing" }
  /** `dueAt` still in the future (stale/early job): caller must re-enqueue with correct delay. */
  | { outcome: "reenqueue"; dueAt: Date };

/**
 * Fire a reminder: CAS `SCHEDULED → DUE` (+ `firedAt`), writing `REMINDER_FIRED`
 * activity in the same transaction iff the CAS won. Idempotent; DB only (no Redis).
 */
export async function processReminderJob(
  reminderId: string,
  now: Date = new Date(),
): Promise<ProcessReminderResult> {
  const row = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!row) return { outcome: "missing" };
  if (row.status !== "SCHEDULED") return { outcome: "noop" };

  const horizon = new Date(now.getTime() + FIRE_SKEW_MS);
  if (row.dueAt.getTime() > horizon.getTime()) {
    return { outcome: "reenqueue", dueAt: row.dueAt };
  }

  return prisma.$transaction(async (tx): Promise<ProcessReminderResult> => {
    const res = await tx.reminder.updateMany({
      where: { id: reminderId, status: "SCHEDULED", dueAt: { lte: horizon } },
      data: { status: "DUE", firedAt: now },
    });
    if (res.count !== 1) return { outcome: "noop" };
    // Re-read inside tx so payload reflects any edit that landed before the CAS.
    const fired = await tx.reminder.findUniqueOrThrow({
      where: { id: reminderId },
    });
    await tx.activity.create({
      data: {
        applicationId: fired.applicationId,
        userId: fired.userId,
        type: "REMINDER_FIRED",
        payload: {
          reminderId: fired.id,
          kind: fired.kind,
          title: fired.title,
        },
      },
    });
    return { outcome: "fired" };
  });
}

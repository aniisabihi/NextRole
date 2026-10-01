import type {
  ApplicationStatus,
  Interview,
  Prisma,
  Reminder,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { followUpDueAt, interviewDueAt } from "./reminder-schedule.js";
import { safeEnqueue, safeRemoveJobs } from "./reminder-jobs.js";

type Tx = Prisma.TransactionClient;

/**
 * Side effects collected inside a DB transaction and flushed **after** commit
 * (Redis is never touched while a tx is open; enqueue failure must not fail HTTP).
 */
export type ReminderEffects = {
  /** Newly created SCHEDULED rows that need a BullMQ job. */
  enqueue: Reminder[];
  /** `bullJobId`s of rows cancelled in the tx. */
  removeJobIds: string[];
};

export function newReminderEffects(): ReminderEffects {
  return { enqueue: [], removeJobIds: [] };
}

/** Enqueue created rows + remove cancelled jobs. Call after tx commit; never throws. */
export async function flushReminderEffects(
  effects: ReminderEffects,
): Promise<void> {
  await safeRemoveJobs(effects.removeJobIds);
  for (const row of effects.enqueue) {
    const bullJobId = await safeEnqueue({ id: row.id, dueAt: row.dueAt });
    if (!bullJobId) continue;
    try {
      const res = await prisma.reminder.updateMany({
        where: { id: row.id, status: "SCHEDULED", dueAt: row.dueAt },
        data: { bullJobId },
      });
      // Lost a race (cancelled/dismissed meanwhile): drop the job we just added.
      if (res.count !== 1) await safeRemoveJobs([bullJobId]);
    } catch (err) {
      console.error(
        `[reminders] persist job id for ${row.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/** Application statuses whose continuous stay drives FOLLOW_UP. */
export const FOLLOW_UP_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "APPLIED",
  "SCREENING",
]);

export function inFollowUpSet(status: ApplicationStatus | null): boolean {
  return status !== null && FOLLOW_UP_STATUSES.has(status);
}

type CancelKinds = {
  where: Prisma.ReminderWhereInput;
  statuses: Array<"SCHEDULED" | "DUE">;
};

/** Cancel matching rows in-tx; record their job ids for post-commit removal. */
async function cancelRows(
  tx: Tx,
  { where, statuses }: CancelKinds,
  effects: ReminderEffects,
): Promise<void> {
  const rows = await tx.reminder.findMany({
    where: { ...where, status: { in: statuses } },
    select: { id: true, bullJobId: true },
  });
  if (rows.length === 0) return;
  await tx.reminder.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, status: { in: statuses } },
    data: { status: "CANCELLED" },
  });
  for (const r of rows) {
    if (r.bullJobId) effects.removeJobIds.push(r.bullJobId);
  }
}

// ---------------------------------------------------------------- INTERVIEW

/** Cancel SCHEDULED **and** DUE INTERVIEW reminders for an interview. */
export async function cancelInterviewReminders(
  tx: Tx,
  interviewId: string,
  effects: ReminderEffects,
): Promise<void> {
  await cancelRows(
    tx,
    {
      where: { kind: "INTERVIEW", interviewId },
      statuses: ["SCHEDULED", "DUE"],
    },
    effects,
  );
}

/**
 * Cancel any open INTERVIEW reminders, then create a fresh one if the interview
 * is still SCHEDULED and the lead time has not passed. Used on create and on
 * `scheduledAt` change.
 */
export async function rescheduleInterviewReminder(
  tx: Tx,
  input: { userId: string; company: string; interview: Interview },
  effects: ReminderEffects,
): Promise<void> {
  const { userId, company, interview } = input;
  await cancelInterviewReminders(tx, interview.id, effects);
  if (interview.status !== "SCHEDULED") return;

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { interviewLeadHours: true },
  });
  if (!user) return;
  const dueAt = interviewDueAt(interview.scheduledAt, user.interviewLeadHours);
  if (!dueAt) return; // lead already passed: skip

  const label = interview.typeLabel ?? interview.type;
  const row = await tx.reminder.create({
    data: {
      userId,
      applicationId: interview.applicationId,
      kind: "INTERVIEW",
      interviewId: interview.id,
      title: `Interview reminder: ${company} — ${label}`,
      dueAt,
      status: "SCHEDULED",
    },
  });
  effects.enqueue.push(row);
}

// ---------------------------------------------------------------- FOLLOW_UP

/**
 * FOLLOW_UP stay rules. Decides from the **final** `application.status` (the
 * row returned by `tx.application.update/create`), never the pre-tx status.
 *
 * - enter set from outside (incl. create): cancel-all SCHEDULED, then create
 * - APPLIED <-> SCREENING: untouched (clock keeps running)
 * - leave set: cancel SCHEDULED (DUE stays until the user dismisses it)
 *
 * `previousStatus: null` = application just created.
 * `bulkUpdateStatus` goes through `updateApplication`, so this is the single hook point.
 */
export async function syncFollowUpOnStatusChange(
  tx: Tx,
  input: {
    application: {
      id: string;
      userId: string;
      company: string;
      status: ApplicationStatus;
    };
    previousStatus: ApplicationStatus | null;
  },
  effects: ReminderEffects,
): Promise<void> {
  const { application, previousStatus } = input;
  const wasIn = inFollowUpSet(previousStatus);
  const isIn = inFollowUpSet(application.status);
  if (wasIn && isIn) return;

  // Entering, leaving, or outside->outside: no SCHEDULED FOLLOW_UP may survive
  // (outside->outside is a cheap idempotent stale-row cleanup).
  await cancelRows(
    tx,
    {
      where: { kind: "FOLLOW_UP", applicationId: application.id },
      statuses: ["SCHEDULED"],
    },
    effects,
  );
  if (!isIn) return;

  const user = await tx.user.findUnique({
    where: { id: application.userId },
    select: { followUpDays: true },
  });
  if (!user) return;
  const row = await tx.reminder.create({
    data: {
      userId: application.userId,
      applicationId: application.id,
      kind: "FOLLOW_UP",
      title: `Follow up: ${application.company}`,
      dueAt: followUpDueAt(new Date(), user.followUpDays),
      status: "SCHEDULED",
    },
  });
  effects.enqueue.push(row);
}

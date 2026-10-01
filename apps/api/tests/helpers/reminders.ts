import { expect } from "vitest";
import type { Reminder, ReminderKind, ReminderStatus } from "@prisma/client";
import { prisma } from "../../src/db/prisma.js";
import { closeReminderQueue, getReminderQueue } from "../../src/jobs/queue.js";
import { enqueueReminder } from "../../src/jobs/reminder-queue.js";
import { TEST_ORIGIN } from "./http.js";
import { registerAndLogin } from "./applications.js";

export type Session = Awaited<ReturnType<typeof registerAndLogin>>;

/** Auth cookies + CSRF header + Origin. */
export function csrfHeaders(session: Session) {
  return {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
    "X-CSRF-Token": session.cookies.csrf_token!,
  };
}

/** Auth cookies + Origin, no CSRF token header. */
export function noCsrfHeaders(session: Session) {
  return {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
  };
}

export function futureIso(minutesFromNow = 60): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

export async function resetReminderQueue(): Promise<void> {
  await getReminderQueue().obliterate({ force: true });
}

export async function closeQueueAfterTests(): Promise<void> {
  await closeReminderQueue();
}

export async function expectJobExists(bullJobId: string | null | undefined) {
  expect(bullJobId).toBeTruthy();
  const job = await getReminderQueue().getJob(bullJobId!);
  expect(job).toBeTruthy();
  return job!;
}

export async function expectJobGone(bullJobId: string | null | undefined) {
  expect(bullJobId).toBeTruthy();
  const job = await getReminderQueue().getJob(bullJobId!);
  expect(job).toBeFalsy();
}

export async function seedReminder(input: {
  userId: string;
  applicationId: string;
  kind?: ReminderKind;
  status?: ReminderStatus;
  title?: string;
  body?: string | null;
  dueAt?: Date;
  interviewId?: string | null;
  enqueue?: boolean;
}): Promise<Reminder> {
  const dueAt = input.dueAt ?? new Date(Date.now() + 3_600_000);
  const row = await prisma.reminder.create({
    data: {
      userId: input.userId,
      applicationId: input.applicationId,
      kind: input.kind ?? "MANUAL",
      status: input.status ?? "SCHEDULED",
      title: input.title ?? "Seeded",
      body: input.body ?? null,
      dueAt,
      interviewId: input.interviewId ?? null,
    },
  });
  if (input.enqueue) {
    const bullJobId = await enqueueReminder(row);
    return prisma.reminder.update({
      where: { id: row.id },
      data: { bullJobId },
    });
  }
  return row;
}

import type { Prisma, Reminder } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getApplication } from "../applications/applications.service.js";
import { safeEnqueue, safeRemoveJobs } from "./reminder-jobs.js";
import type {
  CreateManualReminderBody,
  ListRemindersQuery,
  UpdateReminderBody,
} from "./schemas.js";

export type ReminderDto = {
  id: string;
  applicationId: string;
  kind: Reminder["kind"];
  interviewId: string | null;
  title: string;
  body: string | null;
  dueAt: string;
  status: Reminder["status"];
  firedAt: string | null;
  createdAt: string;
  application?: { id: string; company: string; title: string };
};

type ReminderWithApp = Reminder & {
  application?: { id: string; company: string; title: string };
};

export function toReminderDto(r: ReminderWithApp): ReminderDto {
  return {
    id: r.id,
    applicationId: r.applicationId,
    kind: r.kind,
    interviewId: r.interviewId,
    title: r.title,
    body: r.body,
    dueAt: r.dueAt.toISOString(),
    status: r.status,
    firedAt: r.firedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    ...(r.application ? { application: r.application } : {}),
  };
}

async function findOwned(userId: string, id: string): Promise<Reminder> {
  const row = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!row) throw new AppError("NOT_FOUND", 404, "Reminder not found");
  return row;
}

async function persistJobId(
  reminder: Reminder,
  previousJobId: string | null,
): Promise<Reminder> {
  const bullJobId = await safeEnqueue({
    id: reminder.id,
    dueAt: reminder.dueAt,
    bullJobId: previousJobId,
  });
  if (!bullJobId) return reminder;
  const res = await prisma.reminder.updateMany({
    where: { id: reminder.id, status: "SCHEDULED", dueAt: reminder.dueAt },
    data: { bullJobId },
  });
  // Lost a race (dismissed/rescheduled meanwhile): drop the job we just added.
  if (res.count !== 1) {
    await safeRemoveJobs([bullJobId]);
    return (
      (await prisma.reminder.findUnique({ where: { id: reminder.id } })) ??
      reminder
    );
  }
  return { ...reminder, bullJobId };
}

export async function createManualReminder(
  userId: string,
  applicationId: string,
  input: CreateManualReminderBody,
): Promise<ReminderDto> {
  await getApplication(userId, applicationId);
  const created = await prisma.reminder.create({
    data: {
      userId,
      applicationId,
      kind: "MANUAL",
      title: input.title,
      body: input.body ?? null,
      dueAt: new Date(input.dueAt),
      status: "SCHEDULED",
    },
  });
  return toReminderDto(await persistJobId(created, null));
}

export async function listReminders(
  userId: string,
  query: ListRemindersQuery,
): Promise<{ items: ReminderDto[] }> {
  const where: Prisma.ReminderWhereInput = { userId };
  if (query.status) where.status = { in: query.status };
  if (query.applicationId) where.applicationId = query.applicationId;
  const rows = await prisma.reminder.findMany({
    where,
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: query.limit,
    include: {
      application: { select: { id: true, company: true, title: true } },
    },
  });
  return { items: rows.map(toReminderDto) };
}

async function dismiss(existing: Reminder): Promise<Reminder> {
  if (existing.status === "DISMISSED" || existing.status === "CANCELLED") {
    return existing;
  }
  await prisma.$transaction(async (tx) => {
    const res = await tx.reminder.updateMany({
      where: { id: existing.id, status: { in: ["SCHEDULED", "DUE"] } },
      data: { status: "DISMISSED" },
    });
    if (res.count !== 1) return;
    await tx.activity.create({
      data: {
        applicationId: existing.applicationId,
        userId: existing.userId,
        type: "REMINDER_DISMISSED",
        payload: {
          reminderId: existing.id,
          kind: existing.kind,
          title: existing.title,
        },
      },
    });
  });
  await safeRemoveJobs([existing.bullJobId]);
  return (
    (await prisma.reminder.findUnique({ where: { id: existing.id } })) ??
    existing
  );
}

export async function updateReminder(
  userId: string,
  id: string,
  patch: UpdateReminderBody,
): Promise<ReminderDto> {
  const existing = await findOwned(userId, id);

  if (patch.status === "DISMISSED") {
    return toReminderDto(await dismiss(existing));
  }

  if (existing.kind !== "MANUAL") {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Only MANUAL reminders can be edited; dismiss instead",
    );
  }
  if (existing.status !== "SCHEDULED") {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Only SCHEDULED reminders can be edited",
    );
  }

  const data: Prisma.ReminderUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.body !== undefined) data.body = patch.body;
  if (patch.dueAt !== undefined) data.dueAt = new Date(patch.dueAt);

  const res = await prisma.reminder.updateMany({
    where: { id, userId, status: "SCHEDULED" },
    data,
  });
  if (res.count !== 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Reminder is no longer editable",
    );
  }
  const updated = await prisma.reminder.findUniqueOrThrow({ where: { id } });
  const dueChanged = updated.dueAt.getTime() !== existing.dueAt.getTime();
  if (!dueChanged) return toReminderDto(updated);
  return toReminderDto(await persistJobId(updated, existing.bullJobId));
}

export async function deleteReminder(
  userId: string,
  id: string,
): Promise<void> {
  const existing = await findOwned(userId, id);
  if (existing.kind !== "MANUAL") {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Only MANUAL reminders can be deleted; dismiss instead",
    );
  }
  if (existing.status === "CANCELLED") return;
  const res = await prisma.reminder.updateMany({
    where: { id, userId, status: { in: ["SCHEDULED", "DUE"] } },
    data: { status: "CANCELLED" },
  });
  if (res.count === 1) await safeRemoveJobs([existing.bullJobId]);
}

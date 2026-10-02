import type {
  Activity,
  Application,
  ApplicationStatus,
  Priority,
  Prisma,
} from "@prisma/client";
import { safeRemoveJobs } from "../reminders/reminder-jobs.js";
import {
  flushReminderEffects,
  newReminderEffects,
  syncFollowUpOnStatusChange,
} from "../reminders/reminder-hooks.js";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  type FieldDiff,
  serializeDiffValue,
  valuesEqual,
} from "../activities/field-diff.js";
import type {
  BoardBulkStatusBody,
  BoardReorderBody,
  CreateApplicationBody,
  ListApplicationsQuery,
  UpdateApplicationBody,
} from "./schemas.js";
import { nextBoardOrderInCell, lockBoardCell } from "./board-order.js";
import { assertTransition } from "./status-transitions.js";

const PRIORITY_RANK: Record<Priority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

const ACTIVITY_SOFT_CAP = 200;

export function priorityRankFor(priority: Priority): number {
  return PRIORITY_RANK[priority];
}

export async function createApplication(
  userId: string,
  input: CreateApplicationBody,
): Promise<Application> {
  const priority = input.priority ?? "MEDIUM";
  const status = input.status ?? "SAVED";

  const effects = newReminderEffects();
  const created = await prisma.$transaction(async (tx) => {
    const boardOrder = await nextBoardOrderInCell(tx, userId, status, priority);
    const application = await tx.application.create({
      data: {
        userId,
        boardOrder,
        company: input.company,
        title: input.title,
        location: input.location,
        employmentType: input.employmentType,
        workplaceType: input.workplaceType,
        salary: input.salary,
        jobUrl: input.jobUrl,
        dateDiscovered: input.dateDiscovered ?? undefined,
        dateApplied: input.dateApplied ?? undefined,
        status,
        priority,
        priorityRank: priorityRankFor(priority),
        notes: input.notes,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        contactRole: input.contactRole,
        resumeVersion: input.resumeVersion,
        coverLetterVersion: input.coverLetterVersion,
      },
    });

    await tx.activity.create({
      data: {
        applicationId: application.id,
        userId,
        type: "APPLICATION_CREATED",
        payload: {
          company: application.company,
          title: application.title,
          status: application.status,
        },
      },
    });

    // Initial APPLIED/SCREENING counts as entering the follow-up set.
    await syncFollowUpOnStatusChange(
      tx,
      { application, previousStatus: null },
      effects,
    );

    return application;
  });
  await flushReminderEffects(effects);
  return created;
}

export async function getApplication(
  userId: string,
  id: string,
): Promise<Application> {
  const application = await prisma.application.findFirst({
    where: { id, userId },
  });
  if (!application) {
    throw new AppError("NOT_FOUND", 404, "Application not found.");
  }
  return application;
}

export async function listApplications(
  userId: string,
  query: ListApplicationsQuery,
): Promise<{
  items: Application[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where: Prisma.ApplicationWhereInput = { userId };

  if (query.q) {
    where.OR = [
      { company: { contains: query.q, mode: "insensitive" } },
      { title: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.status) where.status = query.status;
  if (query.company) {
    where.company = { contains: query.company, mode: "insensitive" };
  }
  if (query.employmentType) where.employmentType = query.employmentType;
  if (query.workplaceType) where.workplaceType = query.workplaceType;
  if (query.priority) where.priority = query.priority;

  const sortField = query.sort === "priority" ? "priorityRank" : query.sort;

  const [total, items] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: [{ [sortField]: query.order }, { id: query.order }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function updateApplication(
  userId: string,
  id: string,
  patch: UpdateApplicationBody,
): Promise<Application> {
  const existing = await prisma.application.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", 404, "Application not found.");
  }

  const data: Prisma.ApplicationUpdateInput = {};
  const fieldDiff: FieldDiff = {};

  let nextStatus: ApplicationStatus | undefined;
  let statusChanging = false;

  for (const [key, raw] of Object.entries(patch) as Array<
    [
      keyof UpdateApplicationBody,
      UpdateApplicationBody[keyof UpdateApplicationBody],
    ]
  >) {
    if (raw === undefined) continue;

    if (key === "status") {
      const to = raw as ApplicationStatus;
      if (to !== existing.status) {
        assertTransition(existing.status, to);
        nextStatus = to;
        statusChanging = true;
        data.status = to;
      }
      continue;
    }

    const from = existing[key as keyof Application];
    if (valuesEqual(from, raw)) continue;

    fieldDiff[key] = {
      from: serializeDiffValue(from),
      to: serializeDiffValue(raw),
    };
    (data as Record<string, unknown>)[key] = raw;

    if (key === "priority") {
      data.priorityRank = priorityRankFor(raw as Priority);
    }
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  const priorityChanging =
    patch.priority !== undefined && patch.priority !== existing.priority;
  const cellChanged = statusChanging || priorityChanging;
  const finalStatus = statusChanging ? nextStatus! : existing.status;
  const finalPriority = priorityChanging
    ? (patch.priority as Priority)
    : existing.priority;

  const effects = newReminderEffects();
  const updated = await prisma.$transaction(async (tx) => {
    if (cellChanged) {
      // Row still has old status/priority until update — not in target cell aggregate.
      data.boardOrder = await nextBoardOrderInCell(
        tx,
        userId,
        finalStatus,
        finalPriority,
      );
    }
    const application = await tx.application.update({
      where: { id },
      data,
    });

    if (statusChanging && nextStatus) {
      await tx.activity.create({
        data: {
          applicationId: id,
          userId,
          type: "STATUS_CHANGED",
          payload: { from: existing.status, to: nextStatus },
        },
      });
      // Hook decides from the post-update row (`application.status`), not `existing`.
      await syncFollowUpOnStatusChange(
        tx,
        { application, previousStatus: existing.status },
        effects,
      );
    }

    if (Object.keys(fieldDiff).length > 0) {
      await tx.activity.create({
        data: {
          applicationId: id,
          userId,
          type: "FIELDS_UPDATED",
          payload: { fields: fieldDiff } as Prisma.InputJsonValue,
        },
      });
    }

    return application;
  });
  await flushReminderEffects(effects);
  return updated;
}

export async function deleteApplication(
  userId: string,
  id: string,
): Promise<void> {
  // Collect pending jobs before the cascade wipes the rows; clean up post-commit.
  const pending = await prisma.reminder.findMany({
    where: {
      applicationId: id,
      userId,
      status: "SCHEDULED",
      bullJobId: { not: null },
    },
    select: { bullJobId: true },
  });
  const deleted = await prisma.application.deleteMany({
    where: { id, userId },
  });
  if (deleted.count === 0) {
    throw new AppError("NOT_FOUND", 404, "Application not found.");
  }
  await safeRemoveJobs(pending.map((r) => r.bullJobId));
}

export async function reorderBoardCell(
  userId: string,
  input: BoardReorderBody,
): Promise<{ ok: true }> {
  const unique = new Set(input.orderedIds);
  if (unique.size !== input.orderedIds.length) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "The board order list is invalid. Refresh and try again.",
    );
  }

  return prisma.$transaction(async (tx) => {
    await lockBoardCell(tx, userId, input.status, input.priority);
    const cell = await tx.application.findMany({
      where: {
        userId,
        status: input.status,
        priority: input.priority,
      },
      select: { id: true },
    });
    const cellIds = new Set(cell.map((a) => a.id));
    if (
      cellIds.size !== input.orderedIds.length ||
      input.orderedIds.some((id) => !cellIds.has(id))
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "The board changed. Refresh and try again.",
      );
    }

    for (let i = 0; i < input.orderedIds.length; i++) {
      const res = await tx.application.updateMany({
        where: {
          id: input.orderedIds[i]!,
          userId,
          status: input.status,
          priority: input.priority,
        },
        data: { boardOrder: i },
      });
      if (res.count !== 1) {
        throw new AppError(
          "CONFLICT",
          409,
          "The board changed. Refresh and try again.",
        );
      }
    }
    return { ok: true as const };
  });
}

export async function bulkUpdateStatus(
  userId: string,
  input: BoardBulkStatusBody,
): Promise<{
  moved: Application[];
  skipped: { id: string; code: string; message: string }[];
}> {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of input.ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  const moved: Application[] = [];
  const skipped: { id: string; code: string; message: string }[] = [];

  for (const id of ids) {
    const existing = await prisma.application.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      skipped.push({
        id,
        code: "NOT_FOUND",
        message: "Application not found.",
      });
      continue;
    }
    if (existing.status === input.toStatus) {
      skipped.push({
        id,
        code: "ALREADY_IN_STATUS",
        message: "Already in that status.",
      });
      continue;
    }
    try {
      assertTransition(existing.status, input.toStatus);
    } catch (e) {
      if (e instanceof AppError && e.code === "INVALID_STATUS_TRANSITION") {
        skipped.push({ id, code: e.code, message: e.message });
        continue;
      }
      throw e;
    }
    // Goes through updateApplication, so FOLLOW_UP status hooks fire per item.
    const updated = await updateApplication(userId, id, {
      status: input.toStatus,
      // inferred UpdateApplicationBody requires these keys; undefined = untouched
      dateDiscovered: undefined,
      dateApplied: undefined,
    });
    moved.push(updated);
  }

  return { moved, skipped };
}

export async function listActivities(
  userId: string,
  applicationId: string,
): Promise<Activity[]> {
  await getApplication(userId, applicationId);

  return prisma.activity.findMany({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
    take: ACTIVITY_SOFT_CAP,
  });
}

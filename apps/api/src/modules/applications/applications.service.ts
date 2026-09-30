import type {
  Activity,
  Application,
  ApplicationStatus,
  Priority,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  CreateApplicationBody,
  ListApplicationsQuery,
  UpdateApplicationBody,
} from "./schemas.js";
import { assertTransition } from "./status-transitions.js";

const PRIORITY_RANK: Record<Priority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

const ACTIVITY_SOFT_CAP = 200;

type FieldDiff = Record<string, { from: unknown; to: unknown }>;

export function priorityRankFor(priority: Priority): number {
  return PRIORITY_RANK[priority];
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return a === b;
}

function serializeDiffValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? null;
}

export async function createApplication(
  userId: string,
  input: CreateApplicationBody,
): Promise<Application> {
  const priority = input.priority ?? "MEDIUM";
  const status = input.status ?? "SAVED";

  return prisma.$transaction(async (tx) => {
    const application = await tx.application.create({
      data: {
        userId,
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

    return application;
  });
}

export async function getApplication(
  userId: string,
  id: string,
): Promise<Application> {
  const application = await prisma.application.findFirst({
    where: { id, userId },
  });
  if (!application) {
    throw new AppError("NOT_FOUND", 404, "Application not found");
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

  const sortField =
    query.sort === "priority" ? "priorityRank" : query.sort;

  const [total, items] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: { [sortField]: query.order },
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
    throw new AppError("NOT_FOUND", 404, "Application not found");
  }

  const data: Prisma.ApplicationUpdateInput = {};
  const fieldDiff: FieldDiff = {};

  let nextStatus: ApplicationStatus | undefined;
  let statusChanging = false;

  for (const [key, raw] of Object.entries(patch) as Array<
    [keyof UpdateApplicationBody, UpdateApplicationBody[keyof UpdateApplicationBody]]
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

  return prisma.$transaction(async (tx) => {
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
    }

    if (Object.keys(fieldDiff).length > 0) {
      await tx.activity.create({
        data: {
          applicationId: id,
          userId,
          type: "FIELDS_UPDATED",
          payload: { fields: fieldDiff },
        },
      });
    }

    return application;
  });
}

export async function deleteApplication(
  userId: string,
  id: string,
): Promise<void> {
  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", 404, "Application not found");
  }

  await prisma.application.delete({ where: { id } });
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

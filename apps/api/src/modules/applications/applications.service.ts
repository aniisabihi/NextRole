import type { Activity, Application, Priority } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  CreateApplicationBody,
  ListApplicationsQuery,
  UpdateApplicationBody,
} from "./schemas.js";

const PRIORITY_RANK: Record<Priority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function priorityRankFor(priority: Priority): number {
  return PRIORITY_RANK[priority];
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
  void userId;
  void query;
  throw new AppError("NOT_IMPLEMENTED", 501, "Not implemented");
}

export async function updateApplication(
  userId: string,
  id: string,
  patch: UpdateApplicationBody,
): Promise<Application> {
  void userId;
  void id;
  void patch;
  throw new AppError("NOT_IMPLEMENTED", 501, "Not implemented");
}

export async function deleteApplication(
  userId: string,
  id: string,
): Promise<void> {
  void userId;
  void id;
  throw new AppError("NOT_IMPLEMENTED", 501, "Not implemented");
}

export async function listActivities(
  userId: string,
  applicationId: string,
): Promise<Activity[]> {
  void userId;
  void applicationId;
  throw new AppError("NOT_IMPLEMENTED", 501, "Not implemented");
}

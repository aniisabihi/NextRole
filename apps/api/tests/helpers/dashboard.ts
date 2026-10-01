import { prisma } from "../../src/db/prisma.js";
import type {
  ApplicationStatus,
  InterviewStatus,
  InterviewType,
} from "@prisma/client";

export async function seedApplication(opts: {
  userId: string;
  status?: ApplicationStatus;
  createdAt?: Date;
  company?: string;
  title?: string;
}) {
  return prisma.application.create({
    data: {
      userId: opts.userId,
      company: opts.company ?? "Acme",
      title: opts.title ?? "Engineer",
      status: opts.status ?? "APPLIED",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

export async function seedInterview(opts: {
  applicationId: string;
  status?: InterviewStatus;
  scheduledAt: Date;
  type?: InterviewType;
}) {
  return prisma.interview.create({
    data: {
      applicationId: opts.applicationId,
      type: opts.type ?? "VIDEO",
      status: opts.status ?? "SCHEDULED",
      scheduledAt: opts.scheduledAt,
    },
  });
}

import type { Interview, InterviewType } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getApplication } from "../applications/applications.service.js";
import type { CreateInterviewBody } from "./schemas.js";

const INTERVIEW_CAP = 50;

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function resolveTypeLabel(
  type: InterviewType,
  typeLabel: string | null | undefined,
): string | null {
  if (type === "OTHER") {
    const label = typeof typeLabel === "string" ? typeLabel.trim() : "";
    if (!label) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "typeLabel is required when type is OTHER",
      );
    }
    return label.slice(0, 100);
  }
  return null;
}

function snapshotPayload(interview: Interview) {
  return {
    interviewId: interview.id,
    interviewType: interview.type,
    typeLabel: interview.typeLabel,
    status: interview.status,
    scheduledAt: interview.scheduledAt.toISOString(),
    interviewer: interview.interviewer,
    locationOrUrl: interview.locationOrUrl,
    notes: interview.notes,
  };
}

export async function listInterviews(
  userId: string,
  applicationId: string,
): Promise<{ items: Interview[] }> {
  await getApplication(userId, applicationId);
  const items = await prisma.interview.findMany({
    where: { applicationId },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
  });
  return { items };
}

export async function createInterview(
  userId: string,
  applicationId: string,
  input: CreateInterviewBody,
): Promise<Interview> {
  await getApplication(userId, applicationId);
  const typeLabel = resolveTypeLabel(input.type, input.typeLabel);

  return prisma.$transaction(async (tx) => {
    const count = await tx.interview.count({ where: { applicationId } });
    if (count >= INTERVIEW_CAP) {
      throw new AppError(
        "INTERVIEW_LIMIT_EXCEEDED",
        400,
        `Maximum of ${INTERVIEW_CAP} interviews per application`,
      );
    }

    const interview = await tx.interview.create({
      data: {
        applicationId,
        scheduledAt: new Date(input.scheduledAt),
        type: input.type,
        typeLabel,
        interviewer: normalizeOptionalString(input.interviewer),
        locationOrUrl: normalizeOptionalString(input.locationOrUrl),
        notes: normalizeOptionalString(input.notes),
      },
    });

    await tx.activity.create({
      data: {
        applicationId,
        userId,
        type: "INTERVIEW_CREATED",
        payload: snapshotPayload(interview),
      },
    });

    return interview;
  });
}

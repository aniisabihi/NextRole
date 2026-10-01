import type { Interview, InterviewType, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  type FieldDiff,
  serializeDiffValue,
  valuesEqual,
} from "../activities/field-diff.js";
import { getApplication } from "../applications/applications.service.js";
import { assertInterviewTransition } from "./interview-status-transitions.js";
import type { CreateInterviewBody, UpdateInterviewBody } from "./schemas.js";

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

function sameEpochMinute(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / 60000) === Math.floor(b.getTime() / 60000);
}

export async function updateInterview(
  userId: string,
  applicationId: string,
  id: string,
  patch: UpdateInterviewBody,
): Promise<Interview> {
  await getApplication(userId, applicationId);
  const existing = await prisma.interview.findFirst({
    where: { id, applicationId },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", 404, "Interview not found");
  }

  if (existing.status !== "SCHEDULED") {
    if (patch.status !== undefined && patch.status !== existing.status) {
      assertInterviewTransition(existing.status, patch.status);
    }
    if (
      patch.scheduledAt !== undefined ||
      patch.type !== undefined ||
      patch.typeLabel !== undefined
    ) {
      throw new AppError(
        "INTERVIEW_TERMINAL_FIELDS_LOCKED",
        400,
        "scheduledAt, type and typeLabel cannot be changed on a finished interview",
      );
    }
  }

  const nextType = patch.type ?? existing.type;
  const effectiveTypeLabel =
    patch.typeLabel !== undefined ? patch.typeLabel : existing.typeLabel;
  const nextTypeLabel = resolveTypeLabel(nextType, effectiveTypeLabel);

  if (patch.status !== undefined) {
    assertInterviewTransition(existing.status, patch.status);
  }
  const statusChanging =
    patch.status !== undefined && patch.status !== existing.status;

  const data: Prisma.InterviewUpdateInput = {};
  const fieldDiff: FieldDiff = {};
  const track = (key: string, from: unknown, to: unknown) => {
    if (valuesEqual(from, to)) return;
    fieldDiff[key] = {
      from: serializeDiffValue(from),
      to: serializeDiffValue(to),
    };
    (data as Record<string, unknown>)[key] = to;
  };

  if (patch.scheduledAt !== undefined) {
    const nextScheduled = new Date(patch.scheduledAt);
    if (!sameEpochMinute(existing.scheduledAt, nextScheduled)) {
      track("scheduledAt", existing.scheduledAt, nextScheduled);
    }
  }
  track("type", existing.type, nextType);
  track("typeLabel", existing.typeLabel, nextTypeLabel);
  if (patch.interviewer !== undefined) {
    track(
      "interviewer",
      existing.interviewer,
      normalizeOptionalString(patch.interviewer),
    );
  }
  if (patch.locationOrUrl !== undefined) {
    track(
      "locationOrUrl",
      existing.locationOrUrl,
      normalizeOptionalString(patch.locationOrUrl),
    );
  }
  if (patch.notes !== undefined) {
    track("notes", existing.notes, normalizeOptionalString(patch.notes));
  }

  if (!statusChanging && Object.keys(fieldDiff).length === 0) {
    return existing;
  }
  if (statusChanging) data.status = patch.status;

  return prisma.$transaction(async (tx) => {
    const interview = await tx.interview.update({ where: { id }, data });

    if (statusChanging) {
      await tx.activity.create({
        data: {
          applicationId,
          userId,
          type: "INTERVIEW_STATUS_CHANGED",
          payload: {
            interviewId: id,
            from: existing.status,
            to: patch.status!,
          },
        },
      });
    }

    if (Object.keys(fieldDiff).length > 0) {
      await tx.activity.create({
        data: {
          applicationId,
          userId,
          type: "INTERVIEW_UPDATED",
          payload: {
            interviewId: id,
            fields: fieldDiff,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return interview;
  });
}

export async function deleteInterview(
  userId: string,
  applicationId: string,
  id: string,
): Promise<void> {
  await getApplication(userId, applicationId);
  const existing = await prisma.interview.findFirst({
    where: { id, applicationId },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", 404, "Interview not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.activity.create({
      data: {
        applicationId,
        userId,
        type: "INTERVIEW_DELETED",
        payload: snapshotPayload(existing),
      },
    });
    const result = await tx.interview.deleteMany({
      where: { id, applicationId },
    });
    if (result.count !== 1) {
      throw new AppError("NOT_FOUND", 404, "Interview not found");
    }
  });
}

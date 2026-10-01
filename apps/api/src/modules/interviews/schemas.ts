import { InterviewStatus, InterviewType } from "@prisma/client";
import { z } from "zod";

function emptyToUndefined(value: unknown) {
  return value === "" ? undefined : value;
}

function trimmedMax(max: number) {
  return z.string().trim().max(max);
}

export const scheduledAtSchema = z
  .string()
  .datetime({ offset: true })
  .refine((s) => {
    const y = new Date(s).getUTCFullYear();
    return y >= 1 && y <= 9999;
  }, "scheduledAt year out of range");

const optionalNullableString = (max: number) =>
  z.preprocess(emptyToUndefined, trimmedMax(max).nullable().optional());

/**
 * typeLabel: do NOT emptyToUndefined — "" must reach service
 * so OTHER+"" → 400 even when prior label existed.
 */
const typeLabelField = z.union([z.string().max(100), z.null()]).optional();

export const createInterviewSchema = z.object({
  scheduledAt: scheduledAtSchema,
  type: z.nativeEnum(InterviewType),
  typeLabel: typeLabelField,
  interviewer: optionalNullableString(200),
  locationOrUrl: optionalNullableString(2000),
  notes: optionalNullableString(10000),
});

export const updateInterviewSchema = z
  .object({
    scheduledAt: scheduledAtSchema.optional(),
    type: z.nativeEnum(InterviewType).optional(),
    typeLabel: typeLabelField,
    status: z.nativeEnum(InterviewStatus).optional(),
    interviewer: optionalNullableString(200),
    locationOrUrl: optionalNullableString(2000),
    notes: optionalNullableString(10000),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

export type CreateInterviewBody = z.infer<typeof createInterviewSchema>;
export type UpdateInterviewBody = z.infer<typeof updateInterviewSchema>;

import { ReminderStatus } from "@prisma/client";
import { z } from "zod";
import { scheduledAtSchema } from "../interviews/schemas.js";

const title = z.string().trim().min(1).max(200);
const body = z
  .union([z.string().trim().max(5000), z.null()])
  .transform((v) => (v === "" ? null : v));

const futureDueAt = scheduledAtSchema.refine(
  (s) => new Date(s).getTime() > Date.now(),
  "dueAt must be in the future",
);

export const createManualReminderSchema = z.object({
  title,
  body: body.optional(),
  dueAt: futureDueAt,
});

export const updateReminderSchema = z
  .object({
    title: title.optional(),
    body: body.optional(),
    dueAt: futureDueAt.optional(),
    status: z.literal("DISMISSED").optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  })
  .refine(
    (v) =>
      v.status === undefined ||
      (v.title === undefined && v.body === undefined && v.dueAt === undefined),
    { message: "status cannot be combined with other fields" },
  );

export const listRemindersQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined
        ? undefined
        : v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    )
    .pipe(z.array(z.nativeEnum(ReminderStatus)).min(1).optional()),
  applicationId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateManualReminderBody = z.infer<
  typeof createManualReminderSchema
>;
export type UpdateReminderBody = z.infer<typeof updateReminderSchema>;
export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;

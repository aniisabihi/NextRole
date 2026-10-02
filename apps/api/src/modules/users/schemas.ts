import { z } from "zod";

export const updateReminderPrefsSchema = z
  .object({
    interviewLeadHours: z.number().int().min(1).max(168).optional(),
    followUpDays: z.number().int().min(1).max(90).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Include at least one field to update.",
  });

export type UpdateReminderPrefsBody = z.infer<typeof updateReminderPrefsSchema>;

export type ReminderPrefsDto = {
  interviewLeadHours: number;
  followUpDays: number;
};

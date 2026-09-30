import {
  ApplicationStatus,
  EmploymentType,
  Priority,
  WorkplaceType,
} from "@prisma/client";
import { z } from "zod";
import { parseOptionalDateInput } from "./dates.js";

function emptyToUndefined(value: unknown) {
  return value === "" ? undefined : value;
}

function trimmedMax(max: number) {
  return z.string().trim().max(max);
}

const httpHttpsUrl = z
  .string()
  .max(2000)
  .url()
  .refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    { message: "URL must start with http:// or https://" },
  );

const optionalJobUrl = z.preprocess(
  emptyToUndefined,
  httpHttpsUrl.optional(),
);

const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().email().max(255).optional(),
);

export const optionalDateInputSchema = z
  .union([z.null(), z.string()])
  .optional()
  .transform((value) => parseOptionalDateInput(value));

const sharedApplicationFields = {
  location: trimmedMax(200),
  employmentType: z.nativeEnum(EmploymentType),
  workplaceType: z.nativeEnum(WorkplaceType),
  salary: trimmedMax(100),
  jobUrl: optionalJobUrl,
  dateDiscovered: optionalDateInputSchema,
  dateApplied: optionalDateInputSchema,
  status: z.nativeEnum(ApplicationStatus),
  priority: z.nativeEnum(Priority),
  notes: trimmedMax(10000),
  contactName: trimmedMax(200),
  contactEmail: optionalEmail,
  contactPhone: trimmedMax(50),
  contactRole: trimmedMax(200),
  resumeVersion: trimmedMax(200),
  coverLetterVersion: trimmedMax(200),
};

export const createApplicationSchema = z.object({
  company: trimmedMax(200).min(1),
  title: trimmedMax(200).min(1),
  location: sharedApplicationFields.location.optional(),
  employmentType: sharedApplicationFields.employmentType.optional(),
  workplaceType: sharedApplicationFields.workplaceType.optional(),
  salary: sharedApplicationFields.salary.optional(),
  jobUrl: sharedApplicationFields.jobUrl,
  dateDiscovered: sharedApplicationFields.dateDiscovered,
  dateApplied: sharedApplicationFields.dateApplied,
  status: sharedApplicationFields.status.optional(),
  priority: sharedApplicationFields.priority.optional(),
  notes: sharedApplicationFields.notes.optional(),
  contactName: sharedApplicationFields.contactName.optional(),
  contactEmail: sharedApplicationFields.contactEmail,
  contactPhone: sharedApplicationFields.contactPhone.optional(),
  contactRole: sharedApplicationFields.contactRole.optional(),
  resumeVersion: sharedApplicationFields.resumeVersion.optional(),
  coverLetterVersion: sharedApplicationFields.coverLetterVersion.optional(),
});

export const updateApplicationSchema = z
  .object({
    company: trimmedMax(200).min(1).optional(),
    title: trimmedMax(200).min(1).optional(),
    location: sharedApplicationFields.location.nullable().optional(),
    employmentType: sharedApplicationFields.employmentType.nullable().optional(),
    workplaceType: sharedApplicationFields.workplaceType.nullable().optional(),
    salary: sharedApplicationFields.salary.nullable().optional(),
    jobUrl: z.preprocess(emptyToUndefined, httpHttpsUrl.nullable().optional()),
    dateDiscovered: sharedApplicationFields.dateDiscovered,
    dateApplied: sharedApplicationFields.dateApplied,
    status: sharedApplicationFields.status.optional(),
    priority: sharedApplicationFields.priority.optional(),
    notes: sharedApplicationFields.notes.nullable().optional(),
    contactName: sharedApplicationFields.contactName.nullable().optional(),
    contactEmail: z.preprocess(
      emptyToUndefined,
      z.string().email().max(255).nullable().optional(),
    ),
    contactPhone: sharedApplicationFields.contactPhone.nullable().optional(),
    contactRole: sharedApplicationFields.contactRole.nullable().optional(),
    resumeVersion: sharedApplicationFields.resumeVersion.nullable().optional(),
    coverLetterVersion: sharedApplicationFields.coverLetterVersion
      .nullable()
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

export const listApplicationsQuerySchema = z.object({
  q: z.string().optional(),
  status: z.nativeEnum(ApplicationStatus).optional(),
  company: z.string().optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  workplaceType: z.nativeEnum(WorkplaceType).optional(),
  priority: z.nativeEnum(Priority).optional(),
  sort: z
    .enum(["updatedAt", "createdAt", "dateApplied", "priority", "status"])
    .default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateApplicationBody = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationBody = z.infer<typeof updateApplicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;

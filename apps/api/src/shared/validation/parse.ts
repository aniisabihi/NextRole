import type { ZodIssue, ZodType } from "zod";
import { AppError } from "../errors/app-error.js";

/** API field paths → wording shown in validation errors. */
const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  password: "Password",
  name: "Name",
  company: "Company",
  title: "Title",
  location: "Location",
  employmentType: "Employment type",
  workplaceType: "Workplace type",
  salary: "Salary",
  jobUrl: "Job URL",
  dateDiscovered: "Date discovered",
  dateApplied: "Date applied",
  status: "Status",
  priority: "Priority",
  notes: "Notes",
  contactName: "Contact name",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  contactRole: "Contact role",
  resumeVersion: "Resume version",
  coverLetterVersion: "Cover letter version",
  scheduledAt: "Interview time",
  type: "Interview type",
  typeLabel: "Type label",
  interviewer: "Interviewer",
  locationOrUrl: "Location or link",
  dueAt: "Due date",
  body: "Details",
  orderedIds: "Board order",
  ids: "Applications",
  toStatus: "Status",
  interviewLeadHours: "Interview lead time",
  followUpDays: "Follow-up delay",
  applicationId: "Application",
  limit: "Limit",
  page: "Page",
  pageSize: "Page size",
  q: "Search",
  sort: "Sort",
  order: "Sort order",
};

function fieldLabel(path: PropertyKey[]): string {
  const key = path.find((p): p is string => typeof p === "string");
  if (key && FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (key) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }
  return "This field";
}

function formatZodIssue(issue: ZodIssue): string {
  const label = fieldLabel(issue.path);
  const code = issue.code;

  if (code === "invalid_format") {
    const format = "format" in issue ? String(issue.format) : "";
    if (format === "email") return "Enter a valid email address.";
    if (format === "url") return `${label} must be a valid URL.`;
    if (format === "datetime") return `${label} must be a valid date and time.`;
    return `${label} isn’t in the right format.`;
  }

  if (code === "too_small") {
    const minimum = "minimum" in issue ? Number(issue.minimum) : undefined;
    const origin = "origin" in issue ? String(issue.origin) : "";
    if (origin === "string") {
      if (minimum === 1) return `${label} is required.`;
      if (minimum != null)
        return `${label} must be at least ${minimum} characters.`;
    }
    if (origin === "number" && minimum != null) {
      return `${label} must be at least ${minimum}.`;
    }
    if (origin === "array" && minimum != null) {
      return `Select at least ${minimum} item${minimum === 1 ? "" : "s"}.`;
    }
    return `${label} is too short.`;
  }

  if (code === "too_big") {
    const maximum = "maximum" in issue ? Number(issue.maximum) : undefined;
    const origin = "origin" in issue ? String(issue.origin) : "";
    if (origin === "string" && maximum != null) {
      return `${label} must be at most ${maximum} characters.`;
    }
    if (origin === "number" && maximum != null) {
      return `${label} must be at most ${maximum}.`;
    }
    if (origin === "array" && maximum != null) {
      return `Select at most ${maximum} items.`;
    }
    return `${label} is too long.`;
  }

  if (code === "invalid_type") {
    const expected = "expected" in issue ? String(issue.expected) : "";
    if (expected === "int") return `${label} must be a whole number.`;
    if (
      expected === "string" ||
      expected === "number" ||
      expected === "boolean"
    ) {
      return `${label} is required.`;
    }
    return `${label} isn’t valid.`;
  }

  if (code === "invalid_value" || code === "not_multiple_of") {
    return `${label} isn’t a valid option.`;
  }

  // Prefer a short custom message when schemas set one; skip Zod’s raw dumps.
  const raw = issue.message?.trim() ?? "";
  if (
    raw &&
    !/^Invalid (input|email|type|string|number|enum|union)/i.test(raw) &&
    !/^Too (small|big):/i.test(raw) &&
    !/^Expected /i.test(raw) &&
    !/received /i.test(raw)
  ) {
    if (issue.path.length === 0 || raw.includes(label)) return raw;
    return `${label}: ${raw}`;
  }

  return `Check ${label.toLowerCase()} and try again.`;
}

export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message =
      formatZodIssue(result.error.issues[0]!) ||
      "Please check your input and try again.";
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      message,
      result.error.flatten(),
    );
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodType<T>, data: unknown): T {
  return parseBody(schema, data);
}

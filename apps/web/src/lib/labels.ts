import type {
  ApplicationSortField,
  ApplicationStatus,
  EmploymentType,
  Priority,
  WorkplaceType,
} from "./types";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  TECHNICAL_INTERVIEW: "Technical interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  OTHER: "Other",
};

export const WORKPLACE_TYPE_LABELS: Record<WorkplaceType, string> = {
  ON_SITE: "On-site",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
};

export const SORT_FIELD_LABELS: Record<ApplicationSortField, string> = {
  updatedAt: "Updated",
  createdAt: "Created",
  dateApplied: "Date applied",
  priority: "Priority",
  status: "Status",
};

export const SORT_ORDER_LABELS = {
  asc: "Ascending",
  desc: "Descending",
} as const;

export function statusLabel(status: ApplicationStatus): string {
  return STATUS_LABELS[status];
}

export function priorityLabel(priority: Priority): string {
  return PRIORITY_LABELS[priority];
}

export function employmentTypeLabel(value: EmploymentType): string {
  return EMPLOYMENT_TYPE_LABELS[value];
}

export function workplaceTypeLabel(value: WorkplaceType): string {
  return WORKPLACE_TYPE_LABELS[value];
}

export function sortFieldLabel(value: ApplicationSortField): string {
  return SORT_FIELD_LABELS[value];
}

/** Format known enum strings for timeline / list display; pass-through otherwise. */
export function enumLabel(value: string): string {
  if (value in STATUS_LABELS) {
    return STATUS_LABELS[value as ApplicationStatus];
  }
  if (value in PRIORITY_LABELS) {
    return PRIORITY_LABELS[value as Priority];
  }
  if (value in EMPLOYMENT_TYPE_LABELS) {
    return EMPLOYMENT_TYPE_LABELS[value as EmploymentType];
  }
  if (value in WORKPLACE_TYPE_LABELS) {
    return WORKPLACE_TYPE_LABELS[value as WorkplaceType];
  }
  return value.replaceAll("_", " ");
}

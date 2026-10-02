export type User = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

export type AuthResponse = {
  user: User;
};

export const APPLICATION_STATUSES = [
  "SAVED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "OTHER",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORKPLACE_TYPES = ["ON_SITE", "HYBRID", "REMOTE"] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const APPLICATION_SORT_FIELDS = [
  "updatedAt",
  "createdAt",
  "dateApplied",
  "priority",
  "status",
] as const;
export type ApplicationSortField = (typeof APPLICATION_SORT_FIELDS)[number];

export type Application = {
  id: string;
  userId: string;
  company: string;
  title: string;
  location: string | null;
  employmentType: EmploymentType | null;
  workplaceType: WorkplaceType | null;
  salary: string | null;
  jobUrl: string | null;
  dateDiscovered: string | null;
  dateApplied: string | null;
  status: ApplicationStatus;
  priority: Priority;
  priorityRank: number;
  boardOrder: number;
  notes: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactRole: string | null;
  resumeVersion: string | null;
  coverLetterVersion: string | null;
  nextInterviewAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationListResponse = {
  items: Application[];
  total: number;
  page: number;
  pageSize: number;
};

export type ApplicationResponse = {
  application: Application;
};

export const ACTIVITY_TYPES = [
  "APPLICATION_CREATED",
  "STATUS_CHANGED",
  "FIELDS_UPDATED",
  "INTERVIEW_CREATED",
  "INTERVIEW_UPDATED",
  "INTERVIEW_STATUS_CHANGED",
  "INTERVIEW_DELETED",
  "REMINDER_FIRED",
  "REMINDER_DISMISSED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type ActivityFieldDiff = {
  from: unknown;
  to: unknown;
};

export type ApplicationCreatedPayload = {
  company: string;
  title: string;
  status: ApplicationStatus;
};

export type StatusChangedPayload = {
  from: ApplicationStatus;
  to: ApplicationStatus;
};

export type FieldsUpdatedPayload = {
  fields: Record<string, ActivityFieldDiff>;
};

export const INTERVIEW_TYPES = [
  "PHONE",
  "VIDEO",
  "ONSITE",
  "TECHNICAL",
  "OTHER",
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_STATUSES = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export type Interview = {
  id: string;
  applicationId: string;
  scheduledAt: string;
  type: InterviewType;
  typeLabel: string | null;
  status: InterviewStatus;
  interviewer: string | null;
  locationOrUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InterviewListResponse = { items: Interview[] };
export type InterviewResponse = { interview: Interview };

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  PHONE: "Phone",
  VIDEO: "Video",
  ONSITE: "On-site",
  TECHNICAL: "Technical",
  OTHER: "Other",
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

/** INTERVIEW_CREATED | INTERVIEW_DELETED: full row snapshot. */
export type InterviewSnapshotPayload = {
  interviewId: string;
  interviewType: InterviewType;
  typeLabel: string | null;
  status: InterviewStatus;
  scheduledAt: string;
  interviewer: string | null;
  locationOrUrl: string | null;
  notes: string | null;
};

export type InterviewUpdatedPayload = {
  interviewId: string;
  fields: Record<string, ActivityFieldDiff>;
};

export type InterviewStatusChangedPayload = {
  interviewId: string;
  from: InterviewStatus;
  to: InterviewStatus;
};

export const REMINDER_KINDS = ["MANUAL", "INTERVIEW", "FOLLOW_UP"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_STATUSES = [
  "SCHEDULED",
  "DUE",
  "DISMISSED",
  "CANCELLED",
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export type Reminder = {
  id: string;
  applicationId: string;
  kind: ReminderKind;
  interviewId: string | null;
  title: string;
  body: string | null;
  dueAt: string;
  status: ReminderStatus;
  firedAt: string | null;
  createdAt: string;
  application?: { id: string; company: string; title: string };
};

export type ReminderListResponse = { items: Reminder[] };

export type ReminderPrefs = {
  interviewLeadHours: number;
  followUpDays: number;
};

export const REMINDER_LEAD_HOURS_MIN = 1;
export const REMINDER_LEAD_HOURS_MAX = 168;
export const REMINDER_FOLLOW_UP_DAYS_MIN = 1;
export const REMINDER_FOLLOW_UP_DAYS_MAX = 90;

/** REMINDER_FIRED | REMINDER_DISMISSED */
export type ReminderActivityPayload = {
  reminderId: string;
  kind: ReminderKind;
  title: string;
};

export type Activity = {
  id: string;
  applicationId: string;
  userId: string;
  type: ActivityType;
  payload:
    | ApplicationCreatedPayload
    | StatusChangedPayload
    | FieldsUpdatedPayload
    | InterviewSnapshotPayload
    | InterviewUpdatedPayload
    | InterviewStatusChangedPayload
    | ReminderActivityPayload
    | Record<string, unknown>;
  createdAt: string;
};

export type ActivityListResponse = {
  items: Activity[];
};

export type DashboardStats = {
  totals: {
    applications: number;
    activePipeline: number;
  };
  byStatus: Record<ApplicationStatus, number>;
  rates: {
    offerRate: number;
    rejectionRate: number;
    terminalCount: number;
  };
  interviews: {
    upcoming: number;
    completed: number;
  };
  monthlyCreated: Array<{ month: string; count: number }>;
};

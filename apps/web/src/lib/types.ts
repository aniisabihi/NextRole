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
  notes: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactRole: string | null;
  resumeVersion: string | null;
  coverLetterVersion: string | null;
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

import type { ApplicationStatus, Priority } from "./types";

export const STATUS_SURFACE: Record<ApplicationStatus, string> = {
  SAVED: "bg-status-saved text-status-saved-ink",
  APPLIED: "bg-status-applied text-status-applied-ink",
  SCREENING: "bg-status-screening text-status-screening-ink",
  INTERVIEW: "bg-status-interview text-status-interview-ink",
  TECHNICAL_INTERVIEW: "bg-status-technical text-status-technical-ink",
  OFFER: "bg-status-offer text-status-offer-ink",
  REJECTED: "bg-status-rejected text-status-rejected-ink",
  WITHDRAWN: "bg-status-withdrawn text-status-withdrawn-ink",
};

export const STATUS_COLUMN: Record<ApplicationStatus, string> = {
  SAVED: "bg-status-saved/60 border-status-saved-ink/20",
  APPLIED: "bg-status-applied/60 border-status-applied-ink/20",
  SCREENING: "bg-status-screening/60 border-status-screening-ink/20",
  INTERVIEW: "bg-status-interview/60 border-status-interview-ink/20",
  TECHNICAL_INTERVIEW: "bg-status-technical/60 border-status-technical-ink/20",
  OFFER: "bg-status-offer/60 border-status-offer-ink/20",
  REJECTED: "bg-status-rejected/60 border-status-rejected-ink/20",
  WITHDRAWN: "bg-status-withdrawn/60 border-status-withdrawn-ink/20",
};

export const STATUS_COLUMN_OVER: Record<ApplicationStatus, string> = {
  SAVED: "ring-2 ring-status-saved-ink/40",
  APPLIED: "ring-2 ring-status-applied-ink/40",
  SCREENING: "ring-2 ring-status-screening-ink/40",
  INTERVIEW: "ring-2 ring-status-interview-ink/40",
  TECHNICAL_INTERVIEW: "ring-2 ring-status-technical-ink/40",
  OFFER: "ring-2 ring-status-offer-ink/40",
  REJECTED: "ring-2 ring-status-rejected-ink/40",
  WITHDRAWN: "ring-2 ring-status-withdrawn-ink/40",
};

export const STATUS_EDGE: Record<ApplicationStatus, string> = {
  SAVED: "border-l-status-saved-ink",
  APPLIED: "border-l-status-applied-ink",
  SCREENING: "border-l-status-screening-ink",
  INTERVIEW: "border-l-status-interview-ink",
  TECHNICAL_INTERVIEW: "border-l-status-technical-ink",
  OFFER: "border-l-status-offer-ink",
  REJECTED: "border-l-status-rejected-ink",
  WITHDRAWN: "border-l-status-withdrawn-ink",
};

export const PRIORITY_CHIP: Record<Priority, string> = {
  LOW: "bg-priority-low text-priority-low-ink",
  MEDIUM: "bg-priority-medium text-priority-medium-ink",
  HIGH: "bg-priority-high text-priority-high-ink",
};

export function statusLabel(status: ApplicationStatus): string {
  return status.replaceAll("_", " ");
}

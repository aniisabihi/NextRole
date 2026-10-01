import { INTERVIEW_STATUS_LABELS, INTERVIEW_TYPE_LABELS } from "./types";
import type {
  Activity,
  InterviewSnapshotPayload,
  InterviewStatusChangedPayload,
  InterviewUpdatedPayload,
} from "./types";

export const INTERVIEW_ACTIVITY_TYPES = [
  "INTERVIEW_CREATED",
  "INTERVIEW_UPDATED",
  "INTERVIEW_STATUS_CHANGED",
  "INTERVIEW_DELETED",
] as const;

export function isInterviewActivity(activity: Activity): boolean {
  return (INTERVIEW_ACTIVITY_TYPES as readonly string[]).includes(
    activity.type,
  );
}

function typeText(p: Partial<InterviewSnapshotPayload>): string {
  if (p.interviewType === "OTHER" && p.typeLabel) return p.typeLabel;
  return p.interviewType
    ? (INTERVIEW_TYPE_LABELS[p.interviewType] ?? p.interviewType)
    : "Interview";
}

function statusText(s: string | undefined): string {
  if (!s) return "?";
  return (INTERVIEW_STATUS_LABELS as Record<string, string>)[s] ?? s;
}

function whenText(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** One-line timeline text. Uses payload snapshot only; never a live Interview. */
export function formatInterviewActivity(activity: Activity): string {
  switch (activity.type) {
    case "INTERVIEW_CREATED": {
      const p = activity.payload as Partial<InterviewSnapshotPayload>;
      const when = whenText(p.scheduledAt);
      return `Interview scheduled: ${typeText(p)}${when ? ` on ${when}` : ""}`;
    }
    case "INTERVIEW_DELETED": {
      const p = activity.payload as Partial<InterviewSnapshotPayload>;
      const when = whenText(p.scheduledAt);
      return `Interview deleted: ${typeText(p)}${when ? ` on ${when}` : ""}`;
    }
    case "INTERVIEW_STATUS_CHANGED": {
      const p = activity.payload as Partial<InterviewStatusChangedPayload>;
      return `Interview status changed: ${statusText(p.from)} → ${statusText(p.to)}`;
    }
    case "INTERVIEW_UPDATED": {
      const p = activity.payload as Partial<InterviewUpdatedPayload>;
      const keys = Object.keys(p.fields ?? {});
      return keys.length > 0
        ? `Interview updated: ${keys.join(", ")}`
        : "Interview updated";
    }
    default:
      return "";
  }
}

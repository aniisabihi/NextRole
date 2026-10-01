import type { Activity, ReminderActivityPayload } from "./types";

export function isReminderActivity(activity: Activity): boolean {
  return (
    activity.type === "REMINDER_FIRED" || activity.type === "REMINDER_DISMISSED"
  );
}

/** One-line timeline text from payload snapshot. */
export function formatReminderActivity(activity: Activity): string {
  const p = activity.payload as Partial<ReminderActivityPayload>;
  const title = p.title?.trim();
  const base =
    activity.type === "REMINDER_DISMISSED"
      ? "Reminder dismissed"
      : "Reminder due";
  return title ? `${base}: ${title}` : base;
}

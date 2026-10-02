import { formatReminderDue } from "./reminder-format";

/** Absolute local "next interview" text for board cards; null if absent/invalid. */
export function formatInterviewHint(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return formatReminderDue(iso);
}

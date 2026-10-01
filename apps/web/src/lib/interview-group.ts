import type { Interview } from "./types";

/** Upcoming = SCHEDULED && scheduledAt >= now. Everything else = past. */
export function groupInterviews(
  items: Interview[],
  now: Date = new Date(),
): { upcoming: Interview[]; past: Interview[] } {
  const upcoming: Interview[] = [];
  const past: Interview[] = [];
  for (const i of items) {
    if (i.status === "SCHEDULED" && new Date(i.scheduledAt) >= now) {
      upcoming.push(i);
    } else {
      past.push(i);
    }
  }
  return { upcoming, past };
}

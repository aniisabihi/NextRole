import type { Application, Priority } from "./types";

export type BoardFilters = {
  /** Empty = all priorities. */
  priorities: Priority[];
  upcomingInterviewOnly: boolean;
};

export function hasActiveBoardFilters(f: BoardFilters): boolean {
  return f.priorities.length > 0 || f.upcomingInterviewOnly;
}

function hasUpcomingInterview(app: Application, nowMs: number): boolean {
  if (app.nextInterviewAt == null) return false;
  const t = Date.parse(app.nextInterviewAt);
  return !Number.isNaN(t) && t >= nowMs;
}

export function applicationMatchesBoardFilters(
  app: Application,
  filters: BoardFilters,
  nowMs: number = Date.now(),
): boolean {
  if (
    filters.priorities.length > 0 &&
    !filters.priorities.includes(app.priority)
  ) {
    return false;
  }
  if (filters.upcomingInterviewOnly && !hasUpcomingInterview(app, nowMs)) {
    return false;
  }
  return true;
}

export function filterApplicationsForBoard(
  items: Application[],
  filters: BoardFilters,
  nowMs: number = Date.now(),
): Application[] {
  return items.filter((app) =>
    applicationMatchesBoardFilters(app, filters, nowMs),
  );
}

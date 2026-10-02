import { APPLICATION_STATUSES, type ApplicationStatus } from "./types";

export const BOARD_COLLAPSE_KEY = "nextrole.board.collapsed.v1";

const KNOWN = new Set<string>(APPLICATION_STATUSES);

export function readCollapsedStatuses(): Set<ApplicationStatus> {
  try {
    const raw = localStorage.getItem(BOARD_COLLAPSE_KEY);
    if (raw == null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (v): v is ApplicationStatus => typeof v === "string" && KNOWN.has(v),
      ),
    );
  } catch {
    return new Set();
  }
}

export function writeCollapsedStatuses(
  collapsed: ReadonlySet<ApplicationStatus>,
): void {
  try {
    localStorage.setItem(BOARD_COLLAPSE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // storage unavailable / quota: ignore
  }
}

export function toggleCollapsedStatus(
  collapsed: ReadonlySet<ApplicationStatus>,
  status: ApplicationStatus,
): Set<ApplicationStatus> {
  const next = new Set(collapsed);
  if (next.has(status)) next.delete(status);
  else next.add(status);
  return next;
}

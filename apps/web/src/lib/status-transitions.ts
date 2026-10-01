import type { ApplicationStatus } from "./types";

const TERMINAL = new Set<ApplicationStatus>(["OFFER", "REJECTED", "WITHDRAWN"]);
const WITHDRAWN_REOPEN = new Set<ApplicationStatus>(["SAVED", "APPLIED"]);

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (from === to) return true;
  if (!TERMINAL.has(from)) return true;
  if (TERMINAL.has(to)) return true;
  return from === "WITHDRAWN" && WITHDRAWN_REOPEN.has(to);
}

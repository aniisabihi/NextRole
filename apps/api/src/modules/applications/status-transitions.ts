import type { ApplicationStatus } from "@prisma/client";
import { AppError } from "../../shared/errors/app-error.js";

export const TERMINAL = new Set<ApplicationStatus>(["OFFER", "REJECTED", "WITHDRAWN"]);
const WITHDRAWN_REOPEN = new Set<ApplicationStatus>(["SAVED", "APPLIED"]);

export const PIPELINE = new Set<ApplicationStatus>([
  "SAVED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL_INTERVIEW",
]);

export function assertTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): void {
  if (from === to) return;

  const fromTerminal = TERMINAL.has(from);
  const toTerminal = TERMINAL.has(to);

  if (!fromTerminal) return; // non-terminal → anything

  if (toTerminal) return; // terminal → terminal

  // terminal → non-terminal
  if (from === "WITHDRAWN" && WITHDRAWN_REOPEN.has(to)) return;

  throw new AppError(
    "INVALID_STATUS_TRANSITION",
    400,
    `Cannot transition from ${from} to ${to}`,
  );
}

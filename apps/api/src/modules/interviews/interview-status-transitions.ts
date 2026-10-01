import type { InterviewStatus } from "@prisma/client";
import { AppError } from "../../shared/errors/app-error.js";

export function canTransitionInterviewStatus(
  from: InterviewStatus,
  to: InterviewStatus,
): boolean {
  if (from === to) return true;
  return (
    from === "SCHEDULED" &&
    (to === "COMPLETED" || to === "CANCELLED" || to === "NO_SHOW")
  );
}

export function assertInterviewTransition(
  from: InterviewStatus,
  to: InterviewStatus,
): void {
  if (!canTransitionInterviewStatus(from, to)) {
    throw new AppError(
      "INVALID_INTERVIEW_STATUS_TRANSITION",
      400,
      `Cannot change interview status from ${from} to ${to}`,
    );
  }
}

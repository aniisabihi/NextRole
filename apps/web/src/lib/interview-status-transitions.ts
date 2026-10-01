import type { InterviewStatus } from "./types";

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

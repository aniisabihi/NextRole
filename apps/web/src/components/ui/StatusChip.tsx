import type { ApplicationStatus, Priority } from "../../lib/types";
import { priorityLabel, statusLabel } from "../../lib/labels";
import { PRIORITY_CHIP, STATUS_SURFACE } from "../../lib/statusColors";

export function StatusChip({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-[0.625rem] px-2.5 py-0.5 text-xs font-semibold tracking-wide ${STATUS_SURFACE[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-[0.625rem] px-2.5 py-0.5 text-xs font-semibold tracking-wide ${PRIORITY_CHIP[priority]}`}
    >
      {priorityLabel(priority)}
    </span>
  );
}

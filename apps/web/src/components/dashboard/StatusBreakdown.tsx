import { statusLabel } from "../../lib/labels";
import { STATUS_SURFACE } from "../../lib/statusColors";
import { APPLICATION_STATUSES, type DashboardStats } from "../../lib/types";
import { Surface } from "../ui/Surface";

type Props = Pick<DashboardStats, "byStatus">;

export function StatusBreakdown({ byStatus }: Props) {
  return (
    <Surface as="section" className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-ink">By status</h2>
      <ul className="flex flex-wrap gap-2">
        {APPLICATION_STATUSES.map((status) => (
          <li
            key={status}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${STATUS_SURFACE[status]}`}
          >
            <span>{statusLabel(status)}</span>
            <span className="font-display font-semibold tabular-nums">
              {byStatus[status]}
            </span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

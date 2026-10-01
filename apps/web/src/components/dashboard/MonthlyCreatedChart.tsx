import type { DashboardStats } from "../../lib/types";
import { Surface } from "../ui/Surface";

type Props = Pick<DashboardStats, "monthlyCreated"> & {
  isEmpty?: boolean;
};

const MONTH_FORMAT = new Intl.DateTimeFormat("en", {
  month: "short",
  timeZone: "UTC",
});

function shortMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return MONTH_FORMAT.format(new Date(Date.UTC(year, m - 1, 1)));
}

export function MonthlyCreatedChart({ monthlyCreated, isEmpty }: Props) {
  const max = Math.max(1, ...monthlyCreated.map((m) => m.count));
  const summary = monthlyCreated
    .map((m) => `${m.month}: ${m.count}`)
    .join(", ");

  return (
    <Surface as="section" className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-ink">
        Applications created
      </h2>
      <figure
        className="m-0 flex flex-col gap-3"
        aria-label={`Applications created per month, last 6 months. ${summary}`}
      >
        <div
          aria-hidden="true"
          className="grid h-40 grid-cols-6 items-end gap-2 border-b border-border pb-0"
        >
          {monthlyCreated.map((m) => (
            <div
              key={m.month}
              className="flex h-full flex-col items-center justify-end gap-1"
            >
              <span className="text-xs font-medium tabular-nums text-ink-muted">
                {m.count}
              </span>
              <div
                className="w-full max-w-12 rounded-t-[var(--radius-control)] bg-accent"
                style={{
                  height: `${(m.count / max) * 100}%`,
                  minHeight: m.count > 0 ? "4px" : "2px",
                  opacity: m.count > 0 ? 1 : 0.35,
                }}
              />
            </div>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="grid grid-cols-6 gap-2 text-center text-xs text-ink-muted"
        >
          {monthlyCreated.map((m) => (
            <span key={m.month}>{shortMonth(m.month)}</span>
          ))}
        </div>
        <figcaption className="sr-only">
          <ul>
            {monthlyCreated.map((m) => (
              <li key={m.month}>
                {m.month}: {m.count}
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>
      {isEmpty ? (
        <p className="text-sm text-ink-muted">
          No applications yet. Bars fill as you add them.
        </p>
      ) : null}
    </Surface>
  );
}

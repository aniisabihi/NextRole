import { formatRatePercent } from "../../lib/dashboard-format";
import type { DashboardStats } from "../../lib/types";
import { Surface } from "../ui/Surface";

type Props = Pick<DashboardStats, "totals" | "rates">;

export function StatTiles({ totals, rates }: Props) {
  const tiles = [
    {
      label: "Total applications",
      value: String(totals.applications),
      tone: "text-ink",
    },
    {
      label: "Active pipeline",
      value: String(totals.activePipeline),
      tone: "text-status-applied-ink",
    },
    {
      label: "Offer rate",
      value: formatRatePercent(rates.offerRate),
      tone: "text-status-offer-ink",
    },
    {
      label: "Rejection rate",
      value: formatRatePercent(rates.rejectionRate),
      tone: "text-status-rejected-ink",
    },
  ];

  return (
    <section aria-label="Summary" className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Surface key={tile.label} className="flex flex-col gap-1">
            <dt className="text-sm text-ink-muted">{tile.label}</dt>
            <dd className={`font-display text-3xl font-semibold ${tile.tone}`}>
              {tile.value}
            </dd>
          </Surface>
        ))}
      </dl>
      <p className="text-xs text-ink-faint">
        Rates are based on {rates.terminalCount} closed application
        {rates.terminalCount === 1 ? "" : "s"} (offer, rejected, withdrawn).
      </p>
    </section>
  );
}

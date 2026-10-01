import type { DashboardStats } from "../../lib/types";
import { Surface } from "../ui/Surface";

type Props = Pick<DashboardStats, "interviews">;

export function InterviewCounts({ interviews }: Props) {
  const tiles = [
    {
      label: "Upcoming",
      value: interviews.upcoming,
      tone: "bg-status-interview text-status-interview-ink",
    },
    {
      label: "Completed",
      value: interviews.completed,
      tone: "bg-status-screening text-status-screening-ink",
    },
  ];

  return (
    <Surface as="section" className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-ink">
        Interviews
      </h2>
      <dl className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`flex flex-col gap-1 rounded-[var(--radius-control)] px-4 py-3 ${tile.tone}`}
          >
            <dt className="text-sm font-medium">{tile.label}</dt>
            <dd className="font-display text-3xl font-semibold tabular-nums">
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}

import { Button } from "../ui/Button";
import {
  hasActiveBoardFilters,
  type BoardFilters,
} from "../../lib/boardFilter";
import { priorityLabel } from "../../lib/labels";
import { PRIORITIES, type Priority } from "../../lib/types";

const toggleClass = (pressed: boolean) =>
  `inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    pressed
      ? "border-ink bg-accent-soft font-semibold text-ink"
      : "border-border-strong bg-surface text-ink hover:bg-paper"
  }`;

export function BoardToolbar({
  filters,
  onChange,
}: {
  filters: BoardFilters;
  onChange: (next: BoardFilters) => void;
}) {
  const active = hasActiveBoardFilters(filters);

  function togglePriority(p: Priority) {
    const has = filters.priorities.includes(p);
    onChange({
      ...filters,
      priorities: has
        ? filters.priorities.filter((x) => x !== p)
        : PRIORITIES.filter((x) => x === p || filters.priorities.includes(x)),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div
        role="group"
        aria-label="Filter by priority"
        className="flex flex-wrap items-center gap-2"
      >
        {PRIORITIES.map((p) => {
          const pressed = filters.priorities.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={pressed}
              className={toggleClass(pressed)}
              onClick={() => togglePriority(p)}
            >
              {priorityLabel(p)}
            </button>
          );
        })}
        {filters.priorities.length === 0 ? (
          <span className="text-sm text-ink-muted">All priorities</span>
        ) : null}
      </div>
      <button
        type="button"
        aria-pressed={filters.upcomingInterviewOnly}
        className={toggleClass(filters.upcomingInterviewOnly)}
        onClick={() =>
          onChange({
            ...filters,
            upcomingInterviewOnly: !filters.upcomingInterviewOnly,
          })
        }
      >
        Upcoming interview
      </button>
      <Button
        type="button"
        variant="ghost"
        disabled={!active}
        onClick={() =>
          onChange({ priorities: [], upcomingInterviewOnly: false })
        }
      >
        Clear filters
      </Button>
    </div>
  );
}

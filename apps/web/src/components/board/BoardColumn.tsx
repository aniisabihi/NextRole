import { useDroppable } from "@dnd-kit/core";
import { BOARD_PRIORITY_LANES, type BoardCells } from "../../lib/board";
import { columnId } from "../../lib/boardDnd";
import {
  STATUS_COLUMN,
  STATUS_COLUMN_OVER,
  statusLabel,
} from "../../lib/statusColors";
import type { ApplicationStatus } from "../../lib/types";
import { BoardCell } from "./BoardCell";

export function BoardColumn({
  status,
  cells,
  reducedMotion,
  selectedIds,
  onToggleSelect,
}: {
  status: ApplicationStatus;
  cells: BoardCells;
  reducedMotion: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });
  const count = BOARD_PRIORITY_LANES.reduce(
    (n, p) => n + cells[status][p].length,
    0,
  );

  return (
    <section
      ref={setNodeRef}
      role="region"
      aria-label={status}
      className={`flex w-72 shrink-0 flex-col gap-3 rounded-[var(--radius-panel)] border p-3 transition-shadow ${STATUS_COLUMN[status]} ${
        isOver ? STATUS_COLUMN_OVER[status] : ""
      }`}
    >
      <h2 className="font-display text-sm font-semibold text-ink">
        {statusLabel(status)}{" "}
        <span className="font-sans font-medium text-ink-muted">({count})</span>
      </h2>
      {BOARD_PRIORITY_LANES.map((priority) => (
        <BoardCell
          key={priority}
          status={status}
          priority={priority}
          items={cells[status][priority]}
          reducedMotion={reducedMotion}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </section>
  );
}

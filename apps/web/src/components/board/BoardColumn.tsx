import { useId, useRef } from "react";
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
  filtered = false,
  collapsed = false,
  onToggleCollapse,
}: {
  status: ApplicationStatus;
  cells: BoardCells;
  reducedMotion: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  filtered?: boolean;
  /** Collapsed: header + column droppable stay mounted; cells unmount. */
  collapsed?: boolean;
  onToggleCollapse: (status: ApplicationStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const count = BOARD_PRIORITY_LANES.reduce(
    (n, p) => n + cells[status][p].length,
    0,
  );

  function toggle() {
    // Cells unmount on collapse: keep focus from falling to <body>.
    if (!collapsed && panelRef.current?.contains(document.activeElement)) {
      toggleRef.current?.focus();
    }
    onToggleCollapse(status);
  }

  return (
    <section
      ref={setNodeRef}
      role="region"
      aria-label={status}
      className={`flex ${collapsed ? "w-48" : "w-72"} shrink-0 flex-col gap-3 rounded-[var(--radius-panel)] border p-3 transition-[box-shadow,background-color] motion-reduce:transition-none ${STATUS_COLUMN[status]} ${
        isOver ? STATUS_COLUMN_OVER[status] : ""
      }`}
    >
      <h2 className="font-display text-sm font-semibold text-ink">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : panelId}
          onClick={toggle}
          className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] text-left font-display text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span aria-hidden="true" className="w-3 text-ink-muted">
            {collapsed ? "▸" : "▾"}
          </span>
          <span>
            {statusLabel(status)}{" "}
            <span className="font-sans font-medium text-ink-muted">
              ({count})
            </span>
          </span>
        </button>
      </h2>
      <div id={panelId} ref={panelRef} hidden={collapsed}>
        {collapsed ? null : (
          <div className="flex flex-col gap-3">
            {BOARD_PRIORITY_LANES.map((priority) => (
              <BoardCell
                key={priority}
                status={status}
                priority={priority}
                items={cells[status][priority]}
                reducedMotion={reducedMotion}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                filtered={filtered}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

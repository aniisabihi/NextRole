import { useDroppable } from "@dnd-kit/core";
import { BOARD_PRIORITY_LANES, type BoardCells } from "../../lib/board";
import { columnId } from "../../lib/boardDnd";
import type { ApplicationStatus } from "../../lib/types";
import { BoardCell } from "./BoardCell";

export function BoardColumn({
  status,
  cells,
  reducedMotion,
}: {
  status: ApplicationStatus;
  cells: BoardCells;
  reducedMotion: boolean;
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
      className={`flex w-72 shrink-0 flex-col gap-3 rounded border bg-neutral-50 p-3 ${
        isOver ? "border-neutral-900" : "border-neutral-200"
      }`}
    >
      <h2 className="text-sm font-semibold text-neutral-900">
        {status} ({count})
      </h2>
      {BOARD_PRIORITY_LANES.map((priority) => (
        <BoardCell
          key={priority}
          status={status}
          priority={priority}
          items={cells[status][priority]}
          reducedMotion={reducedMotion}
        />
      ))}
    </section>
  );
}

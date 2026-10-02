import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PRIORITY_CHIP } from "../../lib/statusColors";
import { priorityLabel } from "../../lib/labels";
import { cardId, cellId } from "../../lib/boardDnd";
import type { Application, ApplicationStatus, Priority } from "../../lib/types";
import { BoardCard } from "./BoardCard";

export function BoardCell({
  status,
  priority,
  items,
  reducedMotion,
  selectedIds,
  onToggleSelect,
  filtered = false,
}: {
  status: ApplicationStatus;
  priority: Priority;
  items: Application[];
  reducedMotion: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  /** Board filters active: empty lane means no matches, not no data. */
  filtered?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(status, priority),
  });

  return (
    <div
      role="group"
      aria-label={`${status} ${priority} priority`}
      className="flex flex-col gap-2"
    >
      <h3
        className={`inline-flex w-fit items-center rounded-[0.625rem] px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide ${PRIORITY_CHIP[priority]}`}
      >
        {priorityLabel(priority)} ({items.length})
      </h3>
      <SortableContext
        items={items.map((a) => cardId(a.id))}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={`flex min-h-11 flex-col gap-2 rounded-[var(--radius-control)] ${
            isOver ? "outline-2 outline-dashed outline-accent" : ""
          }`}
        >
          {items.length === 0 ? (
            <li className="flex min-h-11 items-center px-1 text-xs text-ink-faint">
              {filtered ? "No matching applications" : "No applications"}
            </li>
          ) : (
            items.map((app) => (
              <BoardCard
                key={app.id}
                app={app}
                reducedMotion={reducedMotion}
                selected={selectedIds.has(app.id)}
                onToggleSelect={onToggleSelect}
              />
            ))
          )}
        </ul>
      </SortableContext>
    </div>
  );
}

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cardId, cellId } from "../../lib/boardDnd";
import type { Application, ApplicationStatus, Priority } from "../../lib/types";
import { BoardCard } from "./BoardCard";

export function BoardCell({
  status,
  priority,
  items,
  reducedMotion,
}: {
  status: ApplicationStatus;
  priority: Priority;
  items: Application[];
  reducedMotion: boolean;
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
        {priority} ({items.length})
      </h3>
      <SortableContext
        items={items.map((a) => cardId(a.id))}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={`flex min-h-11 flex-col gap-2 rounded ${
            isOver ? "outline-2 outline-dashed outline-neutral-900" : ""
          }`}
        >
          {items.length === 0 ? (
            <li className="flex min-h-11 items-center px-1 text-xs text-neutral-600">
              No applications
            </li>
          ) : (
            items.map((app) => (
              <BoardCard key={app.id} app={app} reducedMotion={reducedMotion} />
            ))
          )}
        </ul>
      </SortableContext>
    </div>
  );
}

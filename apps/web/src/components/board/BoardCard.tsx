import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { cardId } from "../../lib/boardDnd";
import type { Application } from "../../lib/types";

export function BoardCardBody({ app }: { app: Application }) {
  return (
    <Link
      className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded px-3 py-2 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      to={`/applications/${app.id}`}
    >
      <span className="text-sm font-medium text-neutral-900">
        {app.company}
      </span>
      <span className="text-sm text-neutral-700">{app.title}</span>
      <span className="text-xs text-neutral-600">Priority: {app.priority}</span>
    </Link>
  );
}

export function BoardCard({
  app,
  reducedMotion,
}: {
  app: Application;
  reducedMotion: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: cardId(app.id),
    transition: reducedMotion ? null : undefined,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-stretch rounded border border-neutral-300 bg-white ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        data-drag-handle={app.id}
        aria-label={`Drag ${app.company}, ${app.title}`}
        className="flex min-h-11 min-w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-l border-r border-neutral-200 text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <BoardCardBody app={app} />
    </li>
  );
}

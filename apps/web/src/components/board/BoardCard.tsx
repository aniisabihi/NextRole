import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { PRIORITY_CHIP } from "../../lib/statusColors";
import { cardId } from "../../lib/boardDnd";
import type { Application } from "../../lib/types";

export function BoardCardBody({ app }: { app: Application }) {
  return (
    <Link
      className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-r-[var(--radius-control)] px-3 py-2 hover:bg-paper/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      to={`/applications/${app.id}`}
    >
      <span className="text-sm font-medium text-ink">{app.company}</span>
      <span className="text-sm text-ink-muted">{app.title}</span>
      <span
        className={`mt-1 inline-flex w-fit items-center rounded-[0.5rem] px-1.5 py-0.5 text-[0.65rem] font-semibold ${PRIORITY_CHIP[app.priority]}`}
      >
        {app.priority}
      </span>
    </Link>
  );
}

export function BoardCard({
  app,
  reducedMotion,
  selected,
  onToggleSelect,
}: {
  app: Application;
  reducedMotion: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
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
      data-selected={selected ? "true" : undefined}
      onClickCapture={(e) => {
        // Cmd/Ctrl-click toggles selection instead of navigating.
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect(app.id);
        }
      }}
      className={`flex items-stretch rounded-[var(--radius-control)] border bg-surface ${
        selected
          ? "border-2 border-accent ring-2 ring-accent/30"
          : "border-border/80"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        data-drag-handle={app.id}
        aria-label={`Drag ${app.company}, ${app.title}${selected ? ", selected" : ""}`}
        className="flex min-h-11 min-w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-[var(--radius-control)] border-r border-border text-ink-muted hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">{selected ? "✓" : "⠿"}</span>
      </button>
      <BoardCardBody app={app} />
    </li>
  );
}

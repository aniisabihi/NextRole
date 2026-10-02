import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { PRIORITY_CHIP, STATUS_EDGE } from "../../lib/statusColors";
import { priorityLabel } from "../../lib/labels";
import { cardId, dragHandleLabel } from "../../lib/boardDnd";
import { formatInterviewHint } from "../../lib/interview-hint";
import type { Application } from "../../lib/types";

export function BoardCardBody({ app }: { app: Application }) {
  const hint = formatInterviewHint(app.nextInterviewAt);
  return (
    <Link
      className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-r-[var(--radius-panel)] px-3 py-2.5 transition-colors hover:bg-paper/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
      to={`/applications/${app.id}`}
    >
      <span className="break-words text-sm font-semibold text-ink">
        {app.company}
      </span>
      <span className="break-words text-sm text-ink-muted">{app.title}</span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex w-fit items-center rounded-[0.5rem] px-1.5 py-0.5 text-[0.65rem] font-semibold ${PRIORITY_CHIP[app.priority]}`}
        >
          {priorityLabel(app.priority)}
        </span>
        {hint ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-[0.5rem] bg-accent-soft px-1.5 py-0.5 text-[0.65rem] font-medium text-accent-hover">
            <span aria-hidden="true">◷</span>
            <span>
              <span className="sr-only">Next interview </span>
              {hint}
            </span>
          </span>
        ) : null}
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
      className={`flex items-stretch rounded-[var(--radius-panel)] border border-l-4 bg-surface shadow-sm ${STATUS_EDGE[app.status]} ${
        selected ? "border-accent ring-2 ring-accent/30" : "border-border/70"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        data-drag-handle={app.id}
        aria-label={dragHandleLabel(app, selected)}
        className="flex min-h-11 min-w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-[var(--radius-panel)] border-r border-border/70 text-ink-muted transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:cursor-grabbing motion-reduce:transition-none"
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">{selected ? "✓" : "⠿"}</span>
      </button>
      <BoardCardBody app={app} />
    </li>
  );
}

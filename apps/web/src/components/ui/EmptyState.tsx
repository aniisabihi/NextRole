import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {description ? (
        <p className="max-w-prose text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

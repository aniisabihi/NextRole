import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Use 3 when nested under an existing h2 section. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <Heading className="font-display text-lg font-semibold text-ink">
        {title}
      </Heading>
      {description ? (
        <p className="max-w-prose text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

import type { ReactNode } from "react";

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-control)] bg-status-rejected px-3 py-2 text-sm font-medium text-status-rejected-ink"
    >
      {children}
    </p>
  );
}

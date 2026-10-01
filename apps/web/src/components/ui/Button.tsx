import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  primary:
    "bg-accent text-white hover:bg-accent-hover disabled:opacity-50 shadow-none",
  secondary:
    "bg-surface text-ink border border-border hover:bg-paper disabled:opacity-50",
  ghost:
    "bg-transparent text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-50",
  danger:
    "bg-status-rejected text-status-rejected-ink hover:opacity-90 disabled:opacity-50",
  tonal:
    "bg-accent-soft text-accent-hover hover:bg-accent/20 disabled:opacity-50",
} as const;

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

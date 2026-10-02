import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

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

export type ButtonVariant = keyof typeof variants;

const baseClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function buttonClassName(
  variant: ButtonVariant = "primary",
  className = "",
): string {
  return `${baseClass} ${variants[variant]} ${className}`;
}

export function Button({
  variant = "primary",
  className = "",
  children,
  loading,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      className={buttonClassName(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </button>
  );
}

/** Styled link that looks like Button — valid `<a>`, middle-click works. */
export function ButtonLink({
  variant = "primary",
  className = "",
  children,
  ...props
}: LinkProps & {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link className={buttonClassName(variant, className)} {...props}>
      {children}
    </Link>
  );
}

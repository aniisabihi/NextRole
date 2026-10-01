import type { ElementType, HTMLAttributes, ReactNode } from "react";

export function Surface({
  children,
  className = "",
  as: Tag = "div",
  ...props
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={`rounded-[var(--radius-panel)] border border-border/80 bg-surface/90 p-5 shadow-[0_1px_0_rgba(26,31,46,0.04)] backdrop-blur-sm ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

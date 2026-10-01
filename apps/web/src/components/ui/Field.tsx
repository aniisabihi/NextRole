import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const controlClass =
  "w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm text-ink-muted ${className}`}>
      <span className="font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={controlClass} {...props} />;
}

export function TextSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={controlClass} {...props} />;
}

export function TextTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <textarea className={`${controlClass} min-h-24`} {...props} />;
}

export { controlClass };

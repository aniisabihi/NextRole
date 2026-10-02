import {
  cloneElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const controlClass =
  "w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<{
    id?: string;
    "aria-invalid"?: boolean | "true" | "false";
    "aria-describedby"?: string;
  }>;
  className?: string;
}) {
  const uid = useId();
  const controlId = children.props.id ?? `${uid}-control`;
  const hintId = hint ? `${uid}-hint` : undefined;
  const errorId = error ? `${uid}-error` : undefined;
  const describedBy =
    [children.props["aria-describedby"], hintId, errorId]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div
      className={`flex flex-col gap-1.5 text-sm text-ink-muted ${className}`}
    >
      <label htmlFor={controlId} className="flex flex-col gap-1.5">
        <span className="font-medium text-ink">{label}</span>
        {cloneElement(children, {
          id: controlId,
          "aria-invalid": error ? true : children.props["aria-invalid"],
          "aria-describedby": describedBy,
        })}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="text-xs font-medium text-status-rejected-ink"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...props} />;
}

export function TextSelect({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} pr-10 ${className}`} {...props} />;
}

export function TextTextarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={`${controlClass} min-h-24 ${className}`} {...props} />
  );
}

export { controlClass };

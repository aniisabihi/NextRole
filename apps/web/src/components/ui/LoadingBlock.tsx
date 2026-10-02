export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="py-6 text-sm text-ink-muted">
      {label}
    </p>
  );
}

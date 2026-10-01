/** Visual badge text: null when hidden, `9+` when capped. */
export function formatBadgeCount(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  const n = Math.floor(count);
  if (n < 1) return null;
  return n > 9 ? "9+" : String(n);
}

export function badgeText(count: number): string {
  return formatBadgeCount(count) ?? "";
}

/** Exact (uncapped) count for assistive tech. */
export function badgeAriaLabel(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return n === 0 ? "Reminders, none due" : `Reminders, ${n} due`;
}

export function dueBadgeCount(
  items: ReadonlyArray<{ status: string }>,
): number {
  return items.filter((r) => r.status === "DUE").length;
}

/** Title-case enum tokens for user-facing copy (OFFER → Offer). */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

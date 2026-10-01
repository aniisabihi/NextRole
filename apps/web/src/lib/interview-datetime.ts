export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new RangeError("Invalid date");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): string {
  if (!value) throw new RangeError("Empty datetime-local");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new RangeError("Invalid datetime-local");
  return d.toISOString();
}

export function sameUtcMinute(aIso: string, bIso: string): boolean {
  return (
    Math.floor(new Date(aIso).getTime() / 60_000) ===
    Math.floor(new Date(bIso).getTime() / 60_000)
  );
}

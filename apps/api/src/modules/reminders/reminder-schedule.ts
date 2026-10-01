const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function interviewDueAt(
  scheduledAt: Date,
  leadHours: number,
  now = new Date(),
): Date | null {
  const dueAtMs = scheduledAt.getTime() - leadHours * MS_PER_HOUR;
  if (dueAtMs <= now.getTime()) {
    return null;
  }
  return new Date(dueAtMs);
}

export function followUpDueAt(stayStartedAt: Date, followUpDays: number): Date {
  return new Date(stayStartedAt.getTime() + followUpDays * MS_PER_DAY);
}

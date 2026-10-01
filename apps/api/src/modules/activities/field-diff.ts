export type FieldDiff = Record<string, { from: unknown; to: unknown }>;

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return a === b;
}

export function serializeDiffValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? null;
}

import { describe, expect, it } from "vitest";
import { formatInterviewHint } from "./interview-hint";
import { formatReminderDue } from "./reminder-format";

describe("formatInterviewHint", () => {
  it("formats valid ISO via formatReminderDue", () => {
    const iso = "2026-10-05T09:30:00.000Z";
    expect(formatInterviewHint(iso)).toBe(formatReminderDue(iso));
  });
  it("returns null for null / undefined / empty", () => {
    expect(formatInterviewHint(null)).toBeNull();
    expect(formatInterviewHint(undefined)).toBeNull();
    expect(formatInterviewHint("")).toBeNull();
  });
  it("returns null for NaN date", () => {
    expect(formatInterviewHint("not-a-date")).toBeNull();
  });
});

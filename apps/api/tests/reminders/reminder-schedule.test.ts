import { describe, expect, it } from "vitest";
import {
  followUpDueAt,
  interviewDueAt,
} from "../../src/modules/reminders/reminder-schedule.js";

describe("interviewDueAt", () => {
  const scheduledAt = new Date("2026-03-10T14:00:00.000Z");

  it("returns scheduledAt minus lead hours (default 24h lead)", () => {
    const due = interviewDueAt(
      scheduledAt,
      24,
      new Date("2026-03-09T00:00:00.000Z"),
    );
    expect(due).toEqual(new Date("2026-03-09T14:00:00.000Z"));
  });

  it("returns null when the lead window has already passed", () => {
    const due = interviewDueAt(
      scheduledAt,
      24,
      new Date("2026-03-09T14:00:00.000Z"),
    );
    expect(due).toBeNull();
  });

  it("returns null when now is after the computed due time", () => {
    const due = interviewDueAt(
      scheduledAt,
      24,
      new Date("2026-03-10T00:00:00.000Z"),
    );
    expect(due).toBeNull();
  });
});

describe("followUpDueAt", () => {
  it("returns stay start plus follow-up days (default 7d)", () => {
    const stayStartedAt = new Date("2026-01-01T10:30:00.000Z");
    expect(followUpDueAt(stayStartedAt, 7)).toEqual(
      new Date("2026-01-08T10:30:00.000Z"),
    );
  });
});

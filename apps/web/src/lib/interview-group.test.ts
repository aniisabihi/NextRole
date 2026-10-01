import { describe, expect, it } from "vitest";
import { groupInterviews } from "./interview-group";
import type { Interview, InterviewStatus } from "./types";

const now = new Date("2026-10-05T12:00:00.000Z");

function mk(id: string, status: InterviewStatus, scheduledAt: string): Interview {
  return {
    id,
    applicationId: "a",
    scheduledAt,
    type: "PHONE",
    typeLabel: null,
    status,
    interviewer: null,
    locationOrUrl: null,
    notes: null,
    createdAt: scheduledAt,
    updatedAt: scheduledAt,
  };
}

describe("groupInterviews", () => {
  it("empty input", () => {
    expect(groupInterviews([], now)).toEqual({ upcoming: [], past: [] });
  });

  it("future SCHEDULED -> upcoming", () => {
    const i = mk("1", "SCHEDULED", "2026-10-06T09:00:00.000Z");
    expect(groupInterviews([i], now)).toEqual({ upcoming: [i], past: [] });
  });

  it("past-dated SCHEDULED -> past", () => {
    const i = mk("1", "SCHEDULED", "2026-10-04T09:00:00.000Z");
    expect(groupInterviews([i], now)).toEqual({ upcoming: [], past: [i] });
  });

  it("SCHEDULED exactly now -> upcoming", () => {
    const i = mk("1", "SCHEDULED", now.toISOString());
    expect(groupInterviews([i], now).upcoming).toEqual([i]);
  });

  it("non-SCHEDULED future -> past", () => {
    const items = (["COMPLETED", "CANCELLED", "NO_SHOW"] as const).map((s) =>
      mk(s, s, "2026-10-06T09:00:00.000Z"),
    );
    expect(groupInterviews(items, now)).toEqual({ upcoming: [], past: items });
  });

  it("preserves input order within groups", () => {
    const a = mk("a", "SCHEDULED", "2026-10-07T09:00:00.000Z");
    const b = mk("b", "COMPLETED", "2026-10-01T09:00:00.000Z");
    const c = mk("c", "SCHEDULED", "2026-10-06T09:00:00.000Z");
    const d = mk("d", "CANCELLED", "2026-10-02T09:00:00.000Z");
    expect(groupInterviews([a, b, c, d], now)).toEqual({
      upcoming: [a, c],
      past: [b, d],
    });
  });
});

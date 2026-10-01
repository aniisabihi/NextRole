import { describe, expect, it } from "vitest";
import {
  formatInterviewActivity,
  isInterviewActivity,
} from "./interview-activity";
import type { Activity } from "./types";

function act(type: Activity["type"], payload: Activity["payload"]): Activity {
  return {
    id: "x",
    applicationId: "a",
    userId: "u",
    type,
    payload,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

const snap = {
  interviewId: "i1",
  interviewType: "VIDEO",
  typeLabel: null,
  status: "SCHEDULED",
  scheduledAt: "2026-10-05T09:30:00.000Z",
  interviewer: null,
  locationOrUrl: null,
  notes: null,
} as const;

describe("formatInterviewActivity", () => {
  it("INTERVIEW_CREATED", () => {
    const s = formatInterviewActivity(act("INTERVIEW_CREATED", { ...snap }));
    expect(s).toContain("Interview scheduled: Video on ");
    expect(s).toContain("2026");
  });

  it("INTERVIEW_CREATED OTHER uses typeLabel", () => {
    const s = formatInterviewActivity(
      act("INTERVIEW_CREATED", {
        ...snap,
        interviewType: "OTHER",
        typeLabel: "Lunch chat",
      }),
    );
    expect(s).toContain("Interview scheduled: Lunch chat on ");
  });

  it("INTERVIEW_DELETED", () => {
    const s = formatInterviewActivity(
      act("INTERVIEW_DELETED", { ...snap, interviewType: "ONSITE" }),
    );
    expect(s).toContain("Interview deleted: On-site on ");
  });

  it("INTERVIEW_STATUS_CHANGED", () => {
    expect(
      formatInterviewActivity(
        act("INTERVIEW_STATUS_CHANGED", {
          interviewId: "i1",
          from: "SCHEDULED",
          to: "NO_SHOW",
        }),
      ),
    ).toBe("Interview status changed: Scheduled → No-show");
  });

  it("INTERVIEW_UPDATED lists fields", () => {
    expect(
      formatInterviewActivity(
        act("INTERVIEW_UPDATED", {
          interviewId: "i1",
          fields: {
            notes: { from: null, to: "x" },
            interviewer: { from: "a", to: "b" },
          },
        }),
      ),
    ).toBe("Interview updated: notes, interviewer");
  });

  it("INTERVIEW_UPDATED without fields", () => {
    expect(
      formatInterviewActivity(act("INTERVIEW_UPDATED", { interviewId: "i1" })),
    ).toBe("Interview updated");
  });

  it("non-interview type -> empty", () => {
    expect(formatInterviewActivity(act("STATUS_CHANGED", {}))).toBe("");
  });

  it("tolerates malformed payload", () => {
    expect(() =>
      formatInterviewActivity(act("INTERVIEW_CREATED", {})),
    ).not.toThrow();
  });
});

describe("isInterviewActivity", () => {
  it("detects interview types only", () => {
    expect(isInterviewActivity(act("INTERVIEW_DELETED", {}))).toBe(true);
    expect(isInterviewActivity(act("FIELDS_UPDATED", {}))).toBe(false);
  });
});

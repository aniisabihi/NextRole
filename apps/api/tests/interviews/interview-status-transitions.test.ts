import { describe, expect, it } from "vitest";
import {
  assertInterviewTransition,
  canTransitionInterviewStatus,
} from "../../src/modules/interviews/interview-status-transitions.js";
import { AppError } from "../../src/shared/errors/app-error.js";

describe("canTransitionInterviewStatus", () => {
  it("allows same status", () => {
    expect(canTransitionInterviewStatus("COMPLETED", "COMPLETED")).toBe(true);
  });
  it("allows SCHEDULED to terminals", () => {
    for (const to of ["COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      expect(canTransitionInterviewStatus("SCHEDULED", to)).toBe(true);
    }
  });
  it("rejects reopen and terminal→terminal", () => {
    expect(canTransitionInterviewStatus("COMPLETED", "SCHEDULED")).toBe(false);
    expect(canTransitionInterviewStatus("CANCELLED", "NO_SHOW")).toBe(false);
    expect(canTransitionInterviewStatus("NO_SHOW", "COMPLETED")).toBe(false);
  });
});

describe("assertInterviewTransition", () => {
  it("throws INVALID_INTERVIEW_STATUS_TRANSITION", () => {
    expect(() => assertInterviewTransition("COMPLETED", "SCHEDULED")).toThrow(
      AppError,
    );
    try {
      assertInterviewTransition("COMPLETED", "SCHEDULED");
    } catch (e) {
      expect(e).toMatchObject({
        code: "INVALID_INTERVIEW_STATUS_TRANSITION",
        statusCode: 400,
      });
    }
  });
});

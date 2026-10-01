import { describe, expect, it } from "vitest";
import { canTransitionInterviewStatus } from "./interview-status-transitions";
import { INTERVIEW_STATUSES } from "./types";

describe("canTransitionInterviewStatus", () => {
  for (const from of INTERVIEW_STATUSES) {
    for (const to of INTERVIEW_STATUSES) {
      const expected =
        from === to || (from === "SCHEDULED" && to !== "SCHEDULED");
      it(`${from} -> ${to} = ${expected}`, () => {
        expect(canTransitionInterviewStatus(from, to)).toBe(expected);
      });
    }
  }
});

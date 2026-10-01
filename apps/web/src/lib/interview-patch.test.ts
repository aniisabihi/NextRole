import { describe, expect, it } from "vitest";
import { buildInterviewPatch, type InterviewFormState } from "./interview-patch";
import type { Interview } from "./types";

const server: Interview = {
  id: "i1",
  applicationId: "a1",
  scheduledAt: "2026-10-05T09:30:00.000Z",
  type: "VIDEO",
  typeLabel: null,
  status: "SCHEDULED",
  interviewer: "Jane",
  locationOrUrl: "https://meet.example.com/x",
  notes: "Bring portfolio",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const same: InterviewFormState = {
  scheduledAtLocal: "2026-10-05T09:30",
  type: "VIDEO",
  typeLabel: "",
  interviewer: "Jane",
  locationOrUrl: "https://meet.example.com/x",
  notes: "Bring portfolio",
};

const open = { terminal: false };
const term = { terminal: true };

describe("buildInterviewPatch", () => {
  it("empty when unchanged", () => {
    expect(buildInterviewPatch(server, same, open)).toEqual({});
  });

  it("includes scheduledAt when minute differs", () => {
    expect(
      buildInterviewPatch(
        server,
        { ...same, scheduledAtLocal: "2026-10-05T10:00" },
        open,
      ),
    ).toEqual({ scheduledAt: "2026-10-05T10:00:00.000Z" });
  });

  it("omits scheduledAt when same minute (seconds differ on server)", () => {
    const s = { ...server, scheduledAt: "2026-10-05T09:30:42.000Z" };
    expect(buildInterviewPatch(s, same, open)).toEqual({});
  });

  it("empty strings become null for clearable fields", () => {
    expect(
      buildInterviewPatch(
        server,
        { ...same, interviewer: "", locationOrUrl: "  ", notes: "" },
        open,
      ),
    ).toEqual({ interviewer: null, locationOrUrl: null, notes: null });
  });

  it("trims values and omits when trimmed equal", () => {
    expect(
      buildInterviewPatch(server, { ...same, interviewer: "  Jane " }, open),
    ).toEqual({});
  });

  it("null server field + empty form omitted", () => {
    const s = { ...server, notes: null };
    expect(buildInterviewPatch(s, { ...same, notes: "" }, open)).toEqual({});
  });

  it("type change to OTHER sends type and typeLabel", () => {
    expect(
      buildInterviewPatch(
        server,
        { ...same, type: "OTHER", typeLabel: " Lunch " },
        open,
      ),
    ).toEqual({ type: "OTHER", typeLabel: "Lunch" });
  });

  it("OTHER label edit only sends typeLabel", () => {
    const s: Interview = { ...server, type: "OTHER", typeLabel: "Lunch" };
    expect(
      buildInterviewPatch(
        s,
        { ...same, type: "OTHER", typeLabel: "Dinner" },
        open,
      ),
    ).toEqual({ typeLabel: "Dinner" });
  });

  it("type away from OTHER sends only type", () => {
    const s: Interview = { ...server, type: "OTHER", typeLabel: "Lunch" };
    expect(
      buildInterviewPatch(s, { ...same, type: "PHONE", typeLabel: "Lunch" }, open),
    ).toEqual({ type: "PHONE" });
  });

  it("ignores typeLabel for non-OTHER", () => {
    expect(
      buildInterviewPatch(server, { ...same, typeLabel: "junk" }, open),
    ).toEqual({});
  });

  it("never includes status", () => {
    const patch = buildInterviewPatch(server, { ...same, notes: "x" }, open);
    expect(patch).not.toHaveProperty("status");
  });

  describe("terminal", () => {
    const done: Interview = { ...server, status: "COMPLETED" };

    it("only interviewer/locationOrUrl/notes", () => {
      expect(
        buildInterviewPatch(
          done,
          {
            scheduledAtLocal: "2030-01-01T00:00",
            type: "OTHER",
            typeLabel: "x",
            interviewer: "Bob",
            locationOrUrl: "Zoom",
            notes: "",
          },
          term,
        ),
      ).toEqual({ interviewer: "Bob", locationOrUrl: "Zoom", notes: null });
    });

    it("does not parse scheduledAtLocal (empty ok)", () => {
      expect(
        buildInterviewPatch(done, { ...same, scheduledAtLocal: "" }, term),
      ).toEqual({});
    });
  });

  it("throws on empty scheduledAtLocal when not terminal", () => {
    expect(() =>
      buildInterviewPatch(server, { ...same, scheduledAtLocal: "" }, open),
    ).toThrow(RangeError);
  });
});

import { describe, expect, it } from "vitest";
import {
  applicationMatchesBoardFilters,
  filterApplicationsForBoard,
  hasActiveBoardFilters,
  type BoardFilters,
} from "./boardFilter";
import type { Application, Priority } from "./types";

const NOW = Date.parse("2026-10-02T12:00:00.000Z");

function app(
  id: string,
  priority: Priority,
  nextInterviewAt: string | null,
): Application {
  return {
    id,
    userId: "u1",
    company: `Co ${id}`,
    title: `Role ${id}`,
    location: null,
    employmentType: null,
    workplaceType: null,
    salary: null,
    jobUrl: null,
    dateDiscovered: null,
    dateApplied: null,
    status: "SAVED",
    priority,
    priorityRank: 0,
    boardOrder: 0,
    notes: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    contactRole: null,
    resumeVersion: null,
    coverLetterVersion: null,
    nextInterviewAt,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

const none: BoardFilters = { priorities: [], upcomingInterviewOnly: false };

describe("hasActiveBoardFilters", () => {
  it("false when no priorities and toggle off", () => {
    expect(hasActiveBoardFilters(none)).toBe(false);
  });
  it("true with priorities", () => {
    expect(
      hasActiveBoardFilters({ priorities: ["HIGH"], upcomingInterviewOnly: false }),
    ).toBe(true);
  });
  it("true with upcoming toggle", () => {
    expect(
      hasActiveBoardFilters({ priorities: [], upcomingInterviewOnly: true }),
    ).toBe(true);
  });
});

describe("applicationMatchesBoardFilters", () => {
  it("matches everything with no filters", () => {
    expect(applicationMatchesBoardFilters(app("a", "LOW", null), none, NOW)).toBe(
      true,
    );
  });

  it("empty priorities = all priorities", () => {
    const f: BoardFilters = { priorities: [], upcomingInterviewOnly: false };
    for (const p of ["LOW", "MEDIUM", "HIGH"] as const) {
      expect(applicationMatchesBoardFilters(app("a", p, null), f, NOW)).toBe(true);
    }
  });

  it("priority multi-select is OR within priorities", () => {
    const f: BoardFilters = {
      priorities: ["HIGH", "LOW"],
      upcomingInterviewOnly: false,
    };
    expect(applicationMatchesBoardFilters(app("a", "HIGH", null), f, NOW)).toBe(true);
    expect(applicationMatchesBoardFilters(app("b", "LOW", null), f, NOW)).toBe(true);
    expect(applicationMatchesBoardFilters(app("c", "MEDIUM", null), f, NOW)).toBe(
      false,
    );
  });

  it("upcoming: future matches", () => {
    const f: BoardFilters = { priorities: [], upcomingInterviewOnly: true };
    expect(
      applicationMatchesBoardFilters(
        app("a", "LOW", "2026-10-03T09:00:00.000Z"),
        f,
        NOW,
      ),
    ).toBe(true);
  });

  it("upcoming: exactly now matches (>=)", () => {
    const f: BoardFilters = { priorities: [], upcomingInterviewOnly: true };
    expect(
      applicationMatchesBoardFilters(
        app("a", "LOW", "2026-10-02T12:00:00.000Z"),
        f,
        NOW,
      ),
    ).toBe(true);
  });

  it("upcoming: past does not match", () => {
    const f: BoardFilters = { priorities: [], upcomingInterviewOnly: true };
    expect(
      applicationMatchesBoardFilters(
        app("a", "LOW", "2026-10-01T09:00:00.000Z"),
        f,
        NOW,
      ),
    ).toBe(false);
  });

  it("upcoming: null does not match", () => {
    const f: BoardFilters = { priorities: [], upcomingInterviewOnly: true };
    expect(applicationMatchesBoardFilters(app("a", "LOW", null), f, NOW)).toBe(
      false,
    );
  });

  it("upcoming: invalid date does not match", () => {
    const f: BoardFilters = { priorities: [], upcomingInterviewOnly: true };
    expect(
      applicationMatchesBoardFilters(app("a", "LOW", "not-a-date"), f, NOW),
    ).toBe(false);
  });

  it("toggle off ignores interview date (invalid ok)", () => {
    expect(
      applicationMatchesBoardFilters(app("a", "LOW", "not-a-date"), none, NOW),
    ).toBe(true);
  });

  it("AND combines priority and upcoming", () => {
    const f: BoardFilters = { priorities: ["HIGH"], upcomingInterviewOnly: true };
    const future = "2026-10-05T09:00:00.000Z";
    expect(applicationMatchesBoardFilters(app("a", "HIGH", future), f, NOW)).toBe(
      true,
    );
    expect(applicationMatchesBoardFilters(app("b", "LOW", future), f, NOW)).toBe(
      false,
    );
    expect(applicationMatchesBoardFilters(app("c", "HIGH", null), f, NOW)).toBe(
      false,
    );
  });

  it("defaults nowMs to Date.now()", () => {
    const f: BoardFilters = { priorities: [], upcomingInterviewOnly: true };
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const past = new Date(Date.now() - 3_600_000).toISOString();
    expect(applicationMatchesBoardFilters(app("a", "LOW", future), f)).toBe(true);
    expect(applicationMatchesBoardFilters(app("b", "LOW", past), f)).toBe(false);
  });
});

describe("filterApplicationsForBoard", () => {
  const items = [
    app("a", "HIGH", "2026-10-05T09:00:00.000Z"),
    app("b", "HIGH", null),
    app("c", "LOW", "2026-10-05T09:00:00.000Z"),
  ];

  it("returns all (same order) with no filters", () => {
    expect(filterApplicationsForBoard(items, none, NOW).map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("filters with AND and preserves order", () => {
    expect(
      filterApplicationsForBoard(
        items,
        { priorities: ["HIGH"], upcomingInterviewOnly: true },
        NOW,
      ).map((x) => x.id),
    ).toEqual(["a"]);
  });

  it("does not mutate input", () => {
    const copy = [...items];
    filterApplicationsForBoard(
      items,
      { priorities: ["LOW"], upcomingInterviewOnly: false },
      NOW,
    );
    expect(items).toEqual(copy);
  });
});

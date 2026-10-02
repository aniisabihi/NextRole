import { describe, expect, it } from "vitest";
import { groupForBoard } from "./board";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
  type Priority,
} from "./types";

function app(
  id: string,
  status: ApplicationStatus,
  priority: Priority,
  boardOrder: number,
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
    status,
    priority,
    priorityRank: 0,
    boardOrder,
    notes: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    contactRole: null,
    resumeVersion: null,
    coverLetterVersion: null,
    nextInterviewAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("groupForBoard", () => {
  it("creates empty cells for every status and priority", () => {
    const cells = groupForBoard([]);
    for (const status of APPLICATION_STATUSES) {
      expect(cells[status]).toEqual({ HIGH: [], MEDIUM: [], LOW: [] });
    }
  });

  it("groups by status and priority", () => {
    const cells = groupForBoard([
      app("a", "SAVED", "HIGH", 0),
      app("b", "SAVED", "LOW", 0),
      app("c", "APPLIED", "HIGH", 0),
    ]);
    expect(cells.SAVED.HIGH.map((x) => x.id)).toEqual(["a"]);
    expect(cells.SAVED.LOW.map((x) => x.id)).toEqual(["b"]);
    expect(cells.APPLIED.HIGH.map((x) => x.id)).toEqual(["c"]);
    expect(cells.APPLIED.MEDIUM).toEqual([]);
  });

  it("sorts each cell by boardOrder ascending", () => {
    const cells = groupForBoard([
      app("a", "SAVED", "HIGH", 2),
      app("b", "SAVED", "HIGH", 0),
      app("c", "SAVED", "HIGH", 1),
    ]);
    expect(cells.SAVED.HIGH.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});

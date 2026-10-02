import { describe, expect, it } from "vitest";
import { groupForBoard } from "./board";
import {
  cardId,
  cellId,
  columnId,
  dragHandleLabel,
  guardFilteredBoardAction,
  parseDndId,
  resolveDrop,
  resolveMultiDrop,
  type DropAction,
  type MultiDropAction,
} from "./boardDnd";
import type { Application } from "./types";

function app(
  id: string,
  status: Application["status"],
  priority: Application["priority"],
  boardOrder: number,
): Application {
  return {
    id,
    status,
    priority,
    boardOrder,
    company: id,
    title: id,
    nextInterviewAt: null,
  } as Application;
}

const cells = groupForBoard([
  app("a", "APPLIED", "HIGH", 1),
  app("b", "APPLIED", "HIGH", 2),
  app("c", "APPLIED", "HIGH", 3),
  app("d", "APPLIED", "LOW", 1),
  app("e", "OFFER", "HIGH", 1),
  app("f", "SAVED", "MEDIUM", 1),
]);

describe("parseDndId", () => {
  it("round-trips locked id scheme", () => {
    expect(parseDndId(columnId("APPLIED"))).toEqual({
      kind: "column",
      status: "APPLIED",
    });
    expect(parseDndId(cellId("APPLIED", "HIGH"))).toEqual({
      kind: "cell",
      status: "APPLIED",
      priority: "HIGH",
    });
    expect(parseDndId(cardId("xyz"))).toEqual({ kind: "card", id: "xyz" });
  });
  it("rejects junk", () => {
    expect(parseDndId("cell:NOPE:HIGH")).toBeNull();
    expect(parseDndId("column:APPLIED:HIGH")).toBeNull();
    expect(parseDndId("foo:bar")).toBeNull();
  });
});

describe("resolveDrop", () => {
  it("no over → none", () => {
    expect(resolveDrop(cells, cardId("a"), null)).toEqual({ type: "none" });
  });
  it("same card / same cell column drop → none", () => {
    expect(resolveDrop(cells, cardId("a"), cardId("a"))).toEqual({
      type: "none",
    });
    expect(resolveDrop(cells, cardId("a"), columnId("APPLIED"))).toEqual({
      type: "none",
    });
  });
  it("cross-column → status update", () => {
    expect(resolveDrop(cells, cardId("a"), columnId("INTERVIEW"))).toEqual({
      type: "update",
      id: "a",
      status: "INTERVIEW",
    });
  });
  it("cross-column onto cell of other priority → status + priority", () => {
    expect(resolveDrop(cells, cardId("a"), cellId("SAVED", "LOW"))).toEqual({
      type: "update",
      id: "a",
      status: "SAVED",
      priority: "LOW",
    });
  });
  it("invalid transition → rejected", () => {
    expect(resolveDrop(cells, cardId("e"), columnId("SAVED"))).toEqual({
      type: "rejected",
      from: "OFFER",
      to: "SAVED",
    });
  });
  it("same status, other lane → priority update", () => {
    expect(resolveDrop(cells, cardId("a"), cellId("APPLIED", "LOW"))).toEqual({
      type: "update",
      id: "a",
      priority: "LOW",
    });
    expect(resolveDrop(cells, cardId("a"), cardId("d"))).toEqual({
      type: "update",
      id: "a",
      priority: "LOW",
    });
  });
  it("within cell → reorder with full ids", () => {
    expect(resolveDrop(cells, cardId("a"), cardId("c"))).toEqual({
      type: "reorder",
      status: "APPLIED",
      priority: "HIGH",
      orderedIds: ["b", "c", "a"],
    });
    expect(resolveDrop(cells, cardId("c"), cardId("a"))).toEqual({
      type: "reorder",
      status: "APPLIED",
      priority: "HIGH",
      orderedIds: ["c", "a", "b"],
    });
  });
  it("own cell drop moves to end; already last → none", () => {
    expect(resolveDrop(cells, cardId("a"), cellId("APPLIED", "HIGH"))).toEqual({
      type: "reorder",
      status: "APPLIED",
      priority: "HIGH",
      orderedIds: ["b", "c", "a"],
    });
    expect(resolveDrop(cells, cardId("c"), cellId("APPLIED", "HIGH"))).toEqual({
      type: "none",
    });
  });
});

describe("resolveMultiDrop", () => {
  it("column drop → bulk to that status", () => {
    expect(resolveMultiDrop(cells, ["a", "b"], columnId("OFFER"))).toEqual({
      type: "bulk",
      ids: ["a", "b"],
      toStatus: "OFFER",
    });
  });

  it("cell/card in another column → bulk to that column", () => {
    expect(
      resolveMultiDrop(cells, ["a"], cellId("OFFER", "LOW")),
    ).toMatchObject({ type: "bulk", toStatus: "OFFER" });
    expect(resolveMultiDrop(cells, ["a"], cardId("e"))).toMatchObject({
      type: "bulk",
      toStatus: "OFFER",
    });
  });

  it("lane/card drop in the selection's own column → unsupported", () => {
    expect(
      resolveMultiDrop(cells, ["a", "b"], cellId("APPLIED", "LOW")),
    ).toEqual({ type: "unsupported" });
    expect(resolveMultiDrop(cells, ["a", "d"], cardId("c"))).toEqual({
      type: "unsupported",
    });
  });

  it("mixed-status selection onto cell is bulk", () => {
    expect(
      resolveMultiDrop(cells, ["a", "f"], cellId("APPLIED", "LOW")),
    ).toMatchObject({ type: "bulk", toStatus: "APPLIED" });
  });

  it("filters ids that cannot transition to target status", () => {
    expect(resolveMultiDrop(cells, ["a", "e"], columnId("SAVED"))).toEqual({
      type: "bulk",
      ids: ["a"],
      toStatus: "SAVED",
    });
    expect(resolveMultiDrop(cells, ["e"], columnId("SAVED"))).toEqual({
      type: "none",
    });
  });

  it("no target / unknown ids → none", () => {
    expect(resolveMultiDrop(cells, ["a"], null)).toEqual({ type: "none" });
    expect(resolveMultiDrop(cells, ["zzz"], columnId("OFFER"))).toEqual({
      type: "none",
    });
  });
});

describe("guardFilteredBoardAction", () => {
  const reorder: DropAction = {
    type: "reorder",
    status: "APPLIED",
    priority: "HIGH",
    orderedIds: ["b", "a", "c"],
  };
  const update: DropAction = { type: "update", id: "a", status: "OFFER" };
  const bulk: MultiDropAction = {
    type: "bulk",
    ids: ["a", "b"],
    toStatus: "OFFER",
  };

  it("blocks reorder when filtered", () => {
    expect(guardFilteredBoardAction(reorder, true)).toBe("block-reorder");
  });
  it("blocks reorder when board truncated", () => {
    expect(guardFilteredBoardAction(reorder, false, true)).toBe(
      "block-reorder",
    );
  });
  it("allows reorder when unfiltered and complete", () => {
    expect(guardFilteredBoardAction(reorder, false)).toBe("allow");
    expect(guardFilteredBoardAction(reorder, false, false)).toBe("allow");
  });
  it("allows update and bulk when filtered", () => {
    expect(guardFilteredBoardAction(update, true)).toBe("allow");
    expect(guardFilteredBoardAction(bulk, true)).toBe("allow");
  });
  it("allows none/rejected/unsupported when filtered", () => {
    expect(guardFilteredBoardAction({ type: "none" }, true)).toBe("allow");
    expect(
      guardFilteredBoardAction(
        { type: "rejected", from: "SAVED", to: "OFFER" },
        true,
      ),
    ).toBe("allow");
    expect(guardFilteredBoardAction({ type: "unsupported" }, true)).toBe(
      "allow",
    );
  });
});

describe("dragHandleLabel", () => {
  const a = {
    ...app("x", "SAVED", "LOW", 0),
    company: "Acme",
    title: "Engineer",
    nextInterviewAt: "2026-10-05T09:30:00.000Z",
  } as Application;
  it("uses company and title only", () => {
    expect(dragHandleLabel(a, false)).toBe("Drag Acme, Engineer");
  });
  it("adds selected suffix", () => {
    expect(dragHandleLabel(a, true)).toBe("Drag Acme, Engineer, selected");
  });
  it("never includes interview text", () => {
    expect(dragHandleLabel(a, false)).not.toMatch(/interview|2026|Oct/i);
  });
});

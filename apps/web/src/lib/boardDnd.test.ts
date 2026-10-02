import { describe, expect, it } from "vitest";
import { groupForBoard } from "./board";
import {
  cardId,
  cellId,
  columnId,
  parseDndId,
  resolveDrop,
  resolveMultiDrop,
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

  it("no target / unknown ids → none", () => {
    expect(resolveMultiDrop(cells, ["a"], null)).toEqual({ type: "none" });
    expect(resolveMultiDrop(cells, ["zzz"], columnId("OFFER"))).toEqual({
      type: "none",
    });
  });
});

import { arrayMove } from "@dnd-kit/sortable";
import type { BoardCells } from "./board";
import { canTransition } from "./status-transitions";
import {
  APPLICATION_STATUSES,
  PRIORITIES,
  type Application,
  type ApplicationStatus,
  type Priority,
} from "./types";

/** Locked id scheme: column:{status}, cell:{status}:{priority}, card:{id}. */
export const columnId = (status: ApplicationStatus) => `column:${status}`;
export const cellId = (status: ApplicationStatus, priority: Priority) =>
  `cell:${status}:${priority}`;
export const cardId = (applicationId: string) => `card:${applicationId}`;

export type ParsedId =
  | { kind: "column"; status: ApplicationStatus }
  | { kind: "cell"; status: ApplicationStatus; priority: Priority }
  | { kind: "card"; id: string };

const isStatus = (v: string): v is ApplicationStatus =>
  (APPLICATION_STATUSES as readonly string[]).includes(v);
const isPriority = (v: string): v is Priority =>
  (PRIORITIES as readonly string[]).includes(v);

export function parseDndId(raw: string | number): ParsedId | null {
  const [kind, a, b, ...rest] = String(raw).split(":");
  if (kind === "card" && a) {
    return { kind: "card", id: [a, b, ...rest].filter(Boolean).join(":") };
  }
  if (kind === "column" && a && b === undefined && isStatus(a)) {
    return { kind: "column", status: a };
  }
  if (
    kind === "cell" &&
    a &&
    b &&
    rest.length === 0 &&
    isStatus(a) &&
    isPriority(b)
  ) {
    return { kind: "cell", status: a, priority: b };
  }
  return null;
}

export function findCard(cells: BoardCells, id: string): Application | null {
  for (const status of APPLICATION_STATUSES) {
    for (const priority of PRIORITIES) {
      const hit = cells[status][priority].find((a) => a.id === id);
      if (hit) return hit;
    }
  }
  return null;
}

export type DropAction =
  | { type: "none" }
  | { type: "rejected"; from: ApplicationStatus; to: ApplicationStatus }
  | {
      type: "update";
      id: string;
      /** Defined only when status changes. */
      status?: ApplicationStatus;
      /** Defined only when priority changes. */
      priority?: Priority;
    }
  | {
      type: "reorder";
      status: ApplicationStatus;
      priority: Priority;
      orderedIds: string[];
    };

/** Pure drop resolution: which API call (if any) a single-card drop implies. */
export function resolveDrop(
  cells: BoardCells,
  activeRaw: string | number,
  overRaw: string | number | null | undefined,
): DropAction {
  if (overRaw == null) return { type: "none" };
  const active = parseDndId(activeRaw);
  const over = parseDndId(overRaw);
  if (!active || active.kind !== "card" || !over) return { type: "none" };
  const card = findCard(cells, active.id);
  if (!card) return { type: "none" };

  let toStatus: ApplicationStatus;
  let toPriority: Priority;
  if (over.kind === "column") {
    toStatus = over.status;
    toPriority = card.priority;
  } else if (over.kind === "cell") {
    toStatus = over.status;
    toPriority = over.priority;
  } else {
    const target = findCard(cells, over.id);
    if (!target) return { type: "none" };
    toStatus = target.status;
    toPriority = target.priority;
  }

  const statusChanged = toStatus !== card.status;
  const priorityChanged = toPriority !== card.priority;

  if (statusChanged && !canTransition(card.status, toStatus)) {
    return { type: "rejected", from: card.status, to: toStatus };
  }
  if (statusChanged || priorityChanged) {
    return {
      type: "update",
      id: card.id,
      ...(statusChanged ? { status: toStatus } : {}),
      ...(priorityChanged ? { priority: toPriority } : {}),
    };
  }

  // Same cell: reorder.
  if (over.kind === "column") return { type: "none" };
  const ids = cells[card.status][card.priority].map((a) => a.id);
  const from = ids.indexOf(card.id);
  const to = over.kind === "card" ? ids.indexOf(over.id) : ids.length - 1; // cell drop → end
  if (from < 0 || to < 0 || from === to) return { type: "none" };
  return {
    type: "reorder",
    status: card.status,
    priority: card.priority,
    orderedIds: arrayMove(ids, from, to),
  };
}

export type MultiDropAction =
  | { type: "none" }
  /** Drop on a lane/card inside the column every selected card already sits in. */
  | { type: "unsupported" }
  | { type: "bulk"; ids: string[]; toStatus: ApplicationStatus };

/**
 * Pure multi-drop resolution. Bulk moves change status only (priority is
 * preserved server-side), so lane moves and reorders are unsupported.
 * A column drop, or a drop on a lane/card of a *different* column, targets
 * that column. A lane/card drop within the selection's own column is a lane
 * move → unsupported. Ids missing from `cells` are dropped.
 */
export function resolveMultiDrop(
  cells: BoardCells,
  selectedIds: Iterable<string>,
  overRaw: string | number | null | undefined,
): MultiDropAction {
  if (overRaw == null) return { type: "none" };
  const over = parseDndId(overRaw);
  if (!over) return { type: "none" };

  const selected: Application[] = [];
  for (const id of selectedIds) {
    const card = findCard(cells, id);
    if (card) selected.push(card);
  }
  if (selected.length === 0) return { type: "none" };

  let toStatus: ApplicationStatus;
  if (over.kind === "card") {
    const target = findCard(cells, over.id);
    if (!target) return { type: "none" };
    toStatus = target.status;
  } else {
    toStatus = over.status;
  }

  if (over.kind !== "column" && selected.every((a) => a.status === toStatus)) {
    return { type: "unsupported" };
  }
  return { type: "bulk", ids: selected.map((a) => a.id), toStatus };
}

import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
  type Priority,
} from "./types";

export const BOARD_PRIORITY_LANES = [
  "HIGH",
  "MEDIUM",
  "LOW",
] as const satisfies readonly Priority[];

export type BoardCells = Record<
  ApplicationStatus,
  Record<Priority, Application[]>
>;

export function groupForBoard(items: Application[]): BoardCells {
  const cells = {} as BoardCells;
  for (const status of APPLICATION_STATUSES) {
    cells[status] = { HIGH: [], MEDIUM: [], LOW: [] };
  }
  for (const app of items) {
    cells[app.status][app.priority].push(app);
  }
  for (const status of APPLICATION_STATUSES) {
    for (const priority of BOARD_PRIORITY_LANES) {
      cells[status][priority].sort((a, b) => a.boardOrder - b.boardOrder);
    }
  }
  return cells;
}

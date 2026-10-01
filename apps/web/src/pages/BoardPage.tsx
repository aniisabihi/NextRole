import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppNav } from "../components/AppNav";
import { apiClient } from "../lib/apiClient";
import { BOARD_PRIORITY_LANES, groupForBoard } from "../lib/board";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationListResponse,
} from "../lib/types";

const BOARD_PATH =
  "/api/applications?pageSize=100&sort=updatedAt&order=desc&page=1";

function BoardCard({ app }: { app: Application }) {
  return (
    <li>
      <Link
        className="flex min-h-11 flex-col gap-0.5 rounded border border-neutral-300 bg-white px-3 py-2 hover:border-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        to={`/applications/${app.id}`}
      >
        <span className="text-sm font-medium text-neutral-900">
          {app.company}
        </span>
        <span className="text-sm text-neutral-700">{app.title}</span>
        <span className="text-xs text-neutral-600">
          Priority: {app.priority}
        </span>
      </Link>
    </li>
  );
}

export function BoardPage() {
  const board = useQuery({
    queryKey: ["applications", "board"],
    queryFn: () => apiClient<ApplicationListResponse>(BOARD_PATH),
  });

  const cells = useMemo(
    () => (board.data ? groupForBoard(board.data.items) : null),
    [board.data],
  );

  return (
    <main className="mx-auto flex max-w-none flex-col gap-4 p-6">
      <AppNav />
      <h1 className="text-2xl font-semibold">Board</h1>

      {board.isPending ? <p>Loading…</p> : null}
      {board.isError ? (
        <p className="text-red-600" role="alert">
          {board.error instanceof Error
            ? board.error.message
            : "Could not load board."}
        </p>
      ) : null}

      {board.data && board.data.total > board.data.items.length ? (
        <p
          className="rounded border border-amber-600 bg-amber-50 px-3 py-2 text-sm text-neutral-900"
          role="status"
        >
          Showing {board.data.items.length} of {board.data.total} applications.
          Board shows the most recently updated; others are not shown.
        </p>
      ) : null}

      {cells ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {APPLICATION_STATUSES.map((status) => {
            const count = BOARD_PRIORITY_LANES.reduce(
              (n, p) => n + cells[status][p].length,
              0,
            );
            return (
              <section
                key={status}
                role="region"
                aria-label={status}
                className="flex w-72 shrink-0 flex-col gap-3 rounded border border-neutral-200 bg-neutral-50 p-3"
              >
                <h2 className="text-sm font-semibold text-neutral-900">
                  {status} ({count})
                </h2>
                {BOARD_PRIORITY_LANES.map((priority) => {
                  const items = cells[status][priority];
                  return (
                    <div
                      key={priority}
                      role="group"
                      aria-label={`${status} ${priority} priority`}
                      className="flex flex-col gap-2"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                        {priority} ({items.length})
                      </h3>
                      {items.length === 0 ? (
                        <p className="text-xs text-neutral-600">
                          No applications
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {items.map((app) => (
                            <BoardCard key={app.id} app={app} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}

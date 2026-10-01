import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AppNav } from "../components/AppNav";
import { BoardCardBody } from "../components/board/BoardCard";
import { BoardColumn } from "../components/board/BoardColumn";
import { apiClient } from "../lib/apiClient";
import { groupForBoard } from "../lib/board";
import {
  findCard,
  parseDndId,
  resolveDrop,
  type DropAction,
} from "../lib/boardDnd";
import { useReducedMotion } from "../lib/useReducedMotion";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationListResponse,
  type ApplicationResponse,
} from "../lib/types";

const BOARD_PATH =
  "/api/applications?pageSize=100&sort=updatedAt&order=desc&page=1";
const BOARD_KEY = ["applications", "board"] as const;

const label = (a: Application) => `${a.company}, ${a.title}`;

/** Pointer: card > cell > column (most specific wins). Keyboard: nearest card/cell. */
const collisionDetection: CollisionDetection = (args) => {
  const rank = (id: string | number) => {
    const kind = parseDndId(id)?.kind;
    return kind === "card" ? 0 : kind === "cell" ? 1 : 2;
  };
  const hits = pointerWithin(args);
  if (hits.length > 0) {
    return [...hits].sort((a, b) => rank(a.id) - rank(b.id));
  }
  return closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => parseDndId(c.id)?.kind !== "column",
    ),
  });
};

export function BoardPage() {
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const board = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => apiClient<ApplicationListResponse>(BOARD_PATH),
  });

  const cells = useMemo(
    () => (board.data ? groupForBoard(board.data.items) : null),
    [board.data],
  );

  const [message, setMessage] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const busy = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Restore focus to moved card's handle once refreshed board has rendered.
  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLElement>(
      `[data-drag-handle="${CSS.escape(focusId)}"]`,
    );
    if (el) {
      el.focus();
      setFocusId(null);
    }
  }, [focusId, cells]);

  const activeApp = useMemo(() => {
    const parsed = activeId ? parseDndId(activeId) : null;
    return cells && parsed?.kind === "card" ? findCard(cells, parsed.id) : null;
  }, [activeId, cells]);

  const announcements = useMemo<Announcements>(() => {
    const nameOf = (id: string | number) => {
      const p = parseDndId(id);
      if (!cells || !p) return "item";
      if (p.kind === "card") {
        const a = findCard(cells, p.id);
        return a ? label(a) : "card";
      }
      if (p.kind === "cell") return `${p.status} ${p.priority} priority`;
      return p.status;
    };
    return {
      onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : undefined,
      // Outcome announced via our own polite live region.
      onDragEnd: () => undefined,
      onDragCancel: ({ active }) => `Cancelled moving ${nameOf(active.id)}.`,
    };
  }, [cells]);

  const refresh = useCallback(
    async (movedId: string) => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEY });
      setFocusId(movedId);
    },
    [queryClient],
  );

  const patch = (id: string, body: object) =>
    apiClient<ApplicationResponse>(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  async function perform(
    action: Exclude<DropAction, { type: "none" } | { type: "rejected" }>,
    moved: Application,
  ) {
    if (action.type === "reorder") {
      const prev = queryClient.getQueryData<ApplicationListResponse>(BOARD_KEY);
      if (prev) {
        // Optimistic: avoid snap-back while request + refetch run.
        const order = new Map(action.orderedIds.map((id, i) => [id, i]));
        queryClient.setQueryData<ApplicationListResponse>(BOARD_KEY, {
          ...prev,
          items: prev.items.map((a) =>
            order.has(a.id) ? { ...a, boardOrder: order.get(a.id)! } : a,
          ),
        });
      }
      try {
        await apiClient<{ ok: true }>("/api/applications/board/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: action.status,
            priority: action.priority,
            orderedIds: action.orderedIds,
          }),
        });
        setMessage(
          `Reordered ${label(moved)} in ${action.status} ${action.priority} priority.`,
        );
      } catch (err) {
        if (prev) queryClient.setQueryData(BOARD_KEY, prev);
        throw err;
      }
      return;
    }
    const body: { status?: string; priority?: string } = {};
    if (action.status) body.status = action.status;
    if (action.priority) body.priority = action.priority;
    await patch(action.id, body);
    const where = [
      action.status ? action.status : null,
      action.priority ? `${action.priority} priority` : null,
    ]
      .filter(Boolean)
      .join(", ");
    setMessage(`Moved ${label(moved)} to ${where}.`);
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!cells) return;
    const parsed = parseDndId(e.active.id);
    if (parsed?.kind !== "card") return;
    const moved = findCard(cells, parsed.id);
    if (!moved) return;
    if (busy.current) {
      setMessage("Previous move still in progress. Try again shortly.");
      return;
    }

    const action = resolveDrop(cells, e.active.id, e.over?.id);
    if (action.type === "none") {
      setFocusId(moved.id);
      return;
    }
    if (action.type === "rejected") {
      setMessage(
        `Cannot move ${label(moved)} from ${action.from} to ${action.to}: transition not allowed.`,
      );
      setFocusId(moved.id);
      return;
    }

    busy.current = true;
    try {
      await perform(action, moved);
    } catch (err) {
      setMessage(
        `Could not move ${label(moved)}: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    } finally {
      busy.current = false;
      await refresh(moved.id);
    }
  }

  return (
    <main className="mx-auto flex max-w-none flex-col gap-4 p-6">
      <AppNav />
      <h1 className="text-2xl font-semibold">Board</h1>

      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>

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
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                "To pick up a card, press space or enter on its drag handle. Use arrow keys to move between cards, lanes and columns. Press space or enter to drop, or escape to cancel.",
            },
          }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {APPLICATION_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                cells={cells}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
            {activeApp ? (
              <div className="flex rounded border border-neutral-900 bg-white shadow-md">
                <div
                  aria-hidden="true"
                  className="flex min-h-11 min-w-11 items-center justify-center border-r border-neutral-200 text-neutral-700"
                >
                  ⠿
                </div>
                <BoardCardBody app={activeApp} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </main>
  );
}

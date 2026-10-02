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
import { AppShell } from "../components/AppShell";
import { Button } from "../components/ui/Button";
import { InlineError } from "../components/ui/InlineError";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import { PageHeader } from "../components/ui/PageHeader";
import { Surface } from "../components/ui/Surface";
import { BoardCardBody } from "../components/board/BoardCard";
import { BoardColumn } from "../components/board/BoardColumn";
import { BoardToolbar } from "../components/board/BoardToolbar";
import { apiClient } from "../lib/apiClient";
import { groupForBoard } from "../lib/board";
import {
  findCard,
  guardFilteredBoardAction,
  parseDndId,
  resolveDrop,
  resolveMultiDrop,
  type DropAction,
} from "../lib/boardDnd";
import {
  filterApplicationsForBoard,
  hasActiveBoardFilters,
  type BoardFilters,
} from "../lib/boardFilter";
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
const plural = (n: number) => `${n} application${n === 1 ? "" : "s"}`;

type BulkStatusResult = {
  moved: Application[];
  skipped: { id: string; code: string; message: string }[];
};

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

  const [filters, setFilters] = useState<BoardFilters>({
    priorities: [],
    upcomingInterviewOnly: false,
  });
  const filtersActive = hasActiveBoardFilters(filters);

  const allItems = board.data?.items;
  const fullCells = useMemo(
    () => (allItems ? groupForBoard(allItems) : null),
    [allItems],
  );
  const visibleItems = useMemo(
    () =>
      allItems
        ? filtersActive
          ? filterApplicationsForBoard(allItems, filters)
          : allItems
        : null,
    [allItems, filters, filtersActive],
  );
  const visibleCells = useMemo(
    () =>
      !visibleItems
        ? null
        : visibleItems === allItems
          ? fullCells
          : groupForBoard(visibleItems),
    [visibleItems, allItems, fullCells],
  );
  // Rendered + drag-resolved cells. Unfiltered: identical to fullCells (reorder
  // safe, complete orderedIds). Filtered: visible subset; reorder blocked below.
  const cells = visibleCells;
  const visibleCount = visibleItems?.length ?? 0;

  const [message, setMessage] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const busy = useRef(false);

  const announceSelection = (n: number) =>
    setMessage(n === 0 ? "Selection cleared." : `${n} selected.`);

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    announceSelection(next.size);
  }

  function clearSelection() {
    if (selectedIds.size === 0) return;
    setSelectedIds(new Set());
    announceSelection(0);
  }

  // Escape clears selection (but not mid-drag: Escape cancels the drag then).
  useEffect(() => {
    if (selectedIds.size === 0 || activeId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelectedIds(new Set());
      setMessage("Selection cleared.");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, activeId]);

  // Drop selected ids not visible on the board (deleted, paged out, filtered out).
  useEffect(() => {
    if (!cells || selectedIds.size === 0) return;
    const live = [...selectedIds].filter((id) => findCard(cells, id));
    if (live.length !== selectedIds.size) setSelectedIds(new Set(live));
  }, [cells, selectedIds]);

  // Announce filtered count after filter changes (debounced; reuses polite region).
  const filterAnnounced = useRef(false);
  useEffect(() => {
    if (!filterAnnounced.current) {
      filterAnnounced.current = true;
      return;
    }
    const t = setTimeout(
      () => setMessage(`Showing ${plural(visibleCount)}`),
      150,
    );
    return () => clearTimeout(t);
    // Only filter changes announce; count changes from refetches stay silent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

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

  const isMultiDrag =
    selectedIds.size > 1 && activeApp !== null && selectedIds.has(activeApp.id);

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
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
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

  const announceReorderBlocked = () =>
    setMessage(
      "Reordering is unavailable while filters are active. Clear filters to reorder, or drop on a column to change status.",
    );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onMultiDragEnd(
    boardCells: NonNullable<typeof cells>,
    anchor: Application,
    overId: string | number | undefined,
  ) {
    const action = resolveMultiDrop(boardCells, selectedIds, overId);
    if (guardFilteredBoardAction(action, filtersActive) === "block-reorder") {
      announceReorderBlocked();
      setFocusId(anchor.id);
      return;
    }
    if (action.type === "none") {
      setFocusId(anchor.id);
      return;
    }
    if (action.type === "unsupported") {
      setMessage(
        "Moving multiple selected cards between priority lanes is not supported. Drop them on a column to change status.",
      );
      setFocusId(anchor.id);
      return;
    }

    busy.current = true;
    try {
      const { moved, skipped } = await apiClient<BulkStatusResult>(
        "/api/applications/board/bulk-status",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: action.ids, toStatus: action.toStatus }),
        },
      );
      setSelectedIds(new Set());
      setMessage(`Moved ${moved.length}, skipped ${skipped.length}`);
    } catch (err) {
      setMessage(
        `Could not move ${plural(action.ids.length)}: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    } finally {
      busy.current = false;
      await refresh(anchor.id);
    }
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

    // Multi-drag: dragged card is part of a selection of 2+.
    if (selectedIds.size > 1 && selectedIds.has(moved.id)) {
      await onMultiDragEnd(cells, moved, e.over?.id);
      return;
    }

    const action = resolveDrop(cells, e.active.id, e.over?.id);
    if (guardFilteredBoardAction(action, filtersActive) === "block-reorder") {
      announceReorderBlocked();
      setFocusId(moved.id);
      return;
    }
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
    <AppShell>
      <PageHeader
        title="Board"
        description="Drag cards across pastel columns. Cmd/Ctrl-click to multi-select."
      />

      <div className="flex min-h-11 flex-wrap items-center gap-3 text-sm text-ink-muted">
        {selectedIds.size > 0 ? (
          <>
            <span className="font-medium text-ink">
              {selectedIds.size} selected
            </span>
            <Button variant="secondary" type="button" onClick={clearSelection}>
              Clear selection
            </Button>
            <span>
              Drag a selected card to a column to move all (status only).
            </span>
          </>
        ) : (
          <span>
            Cmd/Ctrl-click cards to select several, then drag to a column.
          </span>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>

      {board.isPending ? <LoadingBlock label="Loading board…" /> : null}
      {board.isError ? (
        <InlineError>
          {board.error instanceof Error
            ? board.error.message
            : "Could not load board."}
        </InlineError>
      ) : null}

      {board.data ? (
        <BoardToolbar filters={filters} onChange={setFilters} />
      ) : null}

      {board.data && board.data.total > board.data.items.length ? (
        <Surface
          className="border-priority-medium-ink/30 bg-priority-medium/40 text-sm text-ink"
          role="status"
        >
          Showing {board.data.items.length} of {board.data.total} applications.
          Board shows the most recently updated; others are not shown.
        </Surface>
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
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                filtered={filtersActive}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
            {activeApp ? (
              <div className="relative flex rounded-[var(--radius-control)] border-2 border-accent bg-surface shadow-sm">
                {isMultiDrag ? (
                  <span className="absolute -right-2 -top-2 z-10 rounded-[0.625rem] bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                    {selectedIds.size}
                  </span>
                ) : null}
                <div
                  aria-hidden="true"
                  className="flex min-h-11 min-w-11 items-center justify-center border-r border-border text-ink-muted"
                >
                  ⠿
                </div>
                <BoardCardBody app={activeApp} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </AppShell>
  );
}

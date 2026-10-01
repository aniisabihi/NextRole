# NextRole Phase 3 Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/board` Kanban with 8 status columns × priority swimlanes, drag status/reorder/lane, multi bulk-status, `boardOrder` APIs, FE `canTransition`, and a11y/UX gate — per Phase 3 design.

**Architecture:** Extend Phase 2 applications module with `boardOrder` + `POST /board/reorder` + `POST /board/bulk-status` (routes before `/:id`). Web: `@dnd-kit` board page grouping list fetch; mirror transition rules; drag handle + live region.

**Tech Stack:** Existing monorepo — Fastify, Prisma, Zod, Vitest, React, Vite, TanStack Query, Tailwind; add `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.

**Spec:** `docs/superpowers/specs/2026-10-01-nextrole-phase3-design.md` (binding).

## Subagent notes

- Workdir: isolated worktree under `/Users/aniisabihi/Git/Me/NextRole` (skill `using-git-worktrees`); branch `feat/phase-3-kanban` from latest `origin/main`
- After `npm install`: `npm exec -w apps/api -- prisma generate` (enums/client)
- Patterns: `modules/applications/*`, `tests/helpers/applications.ts` (`registerAndLogin`), `tests/helpers/http.ts` (`TEST_ORIGIN`, CSRF cookies), `AppNav`, `apiClient`
- Spec wins on conflict; document deviations in README
- Never commit `.env`
- No interviews / BullMQ / analytics
- Register `/board/*` **before** `/:id`
- Board POSTs rely on existing global CSRF + Origin hooks
- Parallel create `boardOrder` races accepted (Phase 3)
- Fresh subagent: do **not** rely on “see prior draft” — required code is inlined below
- HTTP mutation tests always send `Origin: TEST_ORIGIN`, `Cookie`, `X-CSRF-Token` via `registerAndLogin` (same as Phase 2 CRUD tests)
- FE mutations: `apiClient(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(...) })`
- Query key for board list: `["applications", "board"]` (invalidate on board writes)

## Global Constraints

- Ownership: `userId` on every query; cross-user → skip `NOT_FOUND` (bulk) or `404`/`400` per endpoint rules
- Mutations: CSRF + Origin unchanged
- Soft status matrix via `assertTransition` / FE `canTransition`
- `boardOrder` within `(userId, status, priority)`; `priorityRank` still updated on priority write
- List `pageSize` max **100**
- Reorder: exact full cell `orderedIds`; `{ ok: true }`; last-write-wins
- Bulk: sequential; request `ids` length 1..100 then dedupe; skip `NOT_FOUND` | `INVALID_STATUS_TRANSITION` | `ALREADY_IN_STATUS`; `moved` = full Application rows
- Dual PATCH → one append at final `(status, priority)` cell
- A11y gate from spec (keyboard, live region, AA, reduced-motion, drag handle)
- Gate: `lint` + `typecheck` + `test` (api) + `test -w apps/web` + `build`

---

## File map

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/**/add_board_order/**
apps/api/src/modules/applications/
  board-order.ts
  schemas.ts
  applications.service.ts
  routes.ts
apps/api/tests/applications/
  applications.board.test.ts
apps/web/package.json
apps/web/src/lib/status-transitions.ts
apps/web/src/lib/status-transitions.test.ts
apps/web/src/lib/types.ts
apps/web/src/components/AppNav.tsx
apps/web/src/pages/BoardPage.tsx
apps/web/src/components/board/     # optional: BoardColumn, BoardCard, …
apps/web/src/App.tsx
README.md
docs/PROJECT_CONTEXT.md
```

---

### Task 1: Schema `boardOrder` + pageSize 100 + create append

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: migration `add_board_order`
- Modify: `apps/api/src/modules/applications/schemas.ts` — `pageSize` `.max(100)`
- Modify: `apps/api/src/modules/applications/applications.service.ts` — create appends `boardOrder`
- Create: `apps/api/src/modules/applications/board-order.ts`
- Test: `apps/api/tests/applications/applications.board.test.ts` (start file here)

**Interfaces:**

- Produces: `nextBoardOrderInCell(tx, userId, status, priority): Promise<number>`

- [ ] **Step 1: Write failing tests first** (create two apps same cell → expect `boardOrder` 0 then 1; `GET ?pageSize=100` 200; `pageSize=101` 400). Use `registerAndLogin` + CSRF headers. Expect fail (no `boardOrder` / max still 50).

- [ ] **Step 2: Add helper**

```ts
// apps/api/src/modules/applications/board-order.ts
import type { ApplicationStatus, Priority, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function nextBoardOrderInCell(
  tx: Tx,
  userId: string,
  status: ApplicationStatus,
  priority: Priority,
): Promise<number> {
  const agg = await tx.application.aggregate({
    where: { userId, status, priority },
    _max: { boardOrder: true },
  });
  const max = agg._max.boardOrder;
  return max == null ? 0 : max + 1;
}
```

- [ ] **Step 3: Schema + migrate**

```prisma
  boardOrder         Int               @default(0)
  // …
  @@index([userId, status, priority, boardOrder])
```

```bash
npm run db:migrate:dev -w apps/api -- --name add_board_order
```

Append to generated migration SQL **after** `ADD COLUMN "boardOrder"`:

```sql
WITH ranked AS (
  SELECT id,
    (ROW_NUMBER() OVER (
      PARTITION BY "userId", status, priority
      ORDER BY "updatedAt" DESC
    ) - 1)::int AS rn
  FROM "Application"
)
UPDATE "Application" AS a
SET "boardOrder" = ranked.rn
FROM ranked
WHERE a.id = ranked.id;
```

- [ ] **Step 4: pageSize max 100** in `listApplicationsQuerySchema`

- [ ] **Step 5: createApplication** — inside `$transaction`, before `create`:

```ts
const boardOrder = await nextBoardOrderInCell(tx, userId, status, priority);
// include boardOrder in create data
```

- [ ] **Step 6: Re-run Task 1 tests — PASS**

- [ ] **Step 7: Commit** `feat: add application boardOrder and raise list pageSize to 100`

---

### Task 2: updateApplication boardOrder placement

**Files:**

- Modify: `applications.service.ts` — `updateApplication`
- Test: `applications.board.test.ts`

**Interfaces:**

- Consumes: `nextBoardOrderInCell` from Task 1
- Produces: `updateApplication` places `boardOrder` at end of final cell on status/priority/dual change; keeps `priorityRank` on priority write

- [ ] **Step 1: Failing tests**

| Case | Expect |
| --- | --- |
| PATCH status only | `boardOrder` = end of `(newStatus, oldPriority)` |
| PATCH priority only | `boardOrder` = end of `(oldStatus, newPriority)`; `priorityRank` updated |
| PATCH both | one placement at `(newStatus, newPriority)` |
| Same status no-op | no `boardOrder` change (existing early return) |
| Delete | remaining siblings keep old `boardOrder` (gaps OK) |

- [ ] **Step 2: Implement (single algorithm)**

1. Outside transaction: load `existing`, build `data` / `fieldDiff` / `statusChanging` / `nextStatus`, `assertTransition`, early-return if `data` empty.
2. Cell detection:

```ts
const priorityChanging =
  patch.priority !== undefined && patch.priority !== existing.priority;
const cellChanged = statusChanging || priorityChanging;
const finalStatus = statusChanging ? nextStatus! : existing.status;
const finalPriority = priorityChanging
  ? (patch.priority as Priority)
  : existing.priority;
```

3. Inside `$transaction` **only**:

```ts
if (cellChanged) {
  // Row still has old status/priority until update — not in target cell aggregate.
  data.boardOrder = await nextBoardOrderInCell(
    tx,
    userId,
    finalStatus,
    finalPriority,
  );
}
const application = await tx.application.update({ where: { id }, data });
// … existing activity writes …
```

Never call `nextBoardOrderInCell` outside the transaction.

- [ ] **Step 3: PASS + commit** `feat: place boardOrder on status and priority updates`

---

### Task 3: POST `/board/reorder`

**Files:**

- Modify: `schemas.ts` — `boardReorderSchema` + exported type
- Modify: `applications.service.ts` — `reorderBoardCell`
- Modify: `routes.ts` — register **before** `/:id`
- Test: `applications.board.test.ts`

**Interfaces:**

- Produces:

```ts
export type BoardReorderBody = {
  status: ApplicationStatus;
  priority: Priority;
  orderedIds: string[];
};

reorderBoardCell(userId: string, input: BoardReorderBody): Promise<{ ok: true }>
```

- [ ] **Step 1: Schema**

```ts
export const boardReorderSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  priority: z.nativeEnum(Priority),
  orderedIds: z.array(z.string().min(1)).min(1).max(100),
});
export type BoardReorderBody = z.infer<typeof boardReorderSchema>;
```

- [ ] **Step 2: Failing HTTP tests** (CSRF + Origin)

```ts
const session = await registerAndLogin(app);
await app.inject({
  method: "POST",
  url: "/api/applications/board/reorder",
  headers: {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
    "X-CSRF-Token": session.cookies.csrf_token!,
  },
  payload: { status: "SAVED", priority: "MEDIUM", orderedIds: ["…"] },
});
```

Cases: happy reorder; incomplete set → 400; duplicates → 400; foreign id → 400; empty → 400; **route not shadowed** — `POST /api/applications/board/reorder` is not `/:id` with id=`board` (must not return application `NOT_FOUND` for missing board id).

- [ ] **Step 3: Implement service**

```ts
export async function reorderBoardCell(
  userId: string,
  input: BoardReorderBody,
) {
  const unique = new Set(input.orderedIds);
  if (unique.size !== input.orderedIds.length) {
    throw new AppError("VALIDATION_ERROR", 400, "orderedIds must be unique");
  }
  return prisma.$transaction(async (tx) => {
    const cell = await tx.application.findMany({
      where: {
        userId,
        status: input.status,
        priority: input.priority,
      },
      select: { id: true },
    });
    const cellIds = new Set(cell.map((a) => a.id));
    if (cellIds.size !== input.orderedIds.length) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "orderedIds must match cell membership",
      );
    }
    for (const id of input.orderedIds) {
      if (!cellIds.has(id)) {
        throw new AppError(
          "VALIDATION_ERROR",
          400,
          "orderedIds must match cell membership",
        );
      }
    }
    for (let i = 0; i < input.orderedIds.length; i++) {
      await tx.application.update({
        where: { id: input.orderedIds[i]! },
        data: { boardOrder: i },
      });
    }
    return { ok: true as const };
  });
}
```

- [ ] **Step 4: Route** (above all `/:id` routes)

```ts
app.post("/board/reorder", { preHandler: [authGuard] }, async (request) => {
  const body = parseBody(boardReorderSchema, request.body);
  return applicationsService.reorderBoardCell(request.userId!, body);
});
```

- [ ] **Step 5: PASS + commit** `feat: add board cell reorder endpoint`

---

### Task 4: POST `/board/bulk-status`

**Files:**

- Modify: `schemas.ts` — `boardBulkStatusSchema` + type
- Modify: `applications.service.ts` — `bulkUpdateStatus`
- Modify: `routes.ts`
- Test: `applications.board.test.ts`

**Interfaces:**

- Consumes: Task 2 `updateApplication`
- Produces:

```ts
export type BoardBulkStatusBody = {
  ids: string[];
  toStatus: ApplicationStatus;
};

bulkUpdateStatus(
  userId: string,
  input: BoardBulkStatusBody,
): Promise<{
  moved: Application[];
  skipped: { id: string; code: string; message: string }[];
}>
```

- [ ] **Step 1: Schema**

Pinned: request `ids.length` **1..100**, then dedupe (unique ≤ 100).

```ts
export const boardBulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  toStatus: z.nativeEnum(ApplicationStatus),
});
export type BoardBulkStatusBody = z.infer<typeof boardBulkStatusSchema>;
```

- [ ] **Step 2: Failing HTTP tests** — mixed move/skip; `ALREADY_IN_STATUS`; `NOT_FOUND`; dedupe `["a","a","b"]`; activities only for moved; priority preserved; sequential `boardOrder` in target cell; `POST /board/bulk-status` not shadowed by `/:id`

- [ ] **Step 3: Implement**

```ts
export async function bulkUpdateStatus(
  userId: string,
  input: BoardBulkStatusBody,
) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of input.ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  const moved: Application[] = [];
  const skipped: { id: string; code: string; message: string }[] = [];

  for (const id of ids) {
    const existing = await prisma.application.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      skipped.push({
        id,
        code: "NOT_FOUND",
        message: "Application not found",
      });
      continue;
    }
    if (existing.status === input.toStatus) {
      skipped.push({
        id,
        code: "ALREADY_IN_STATUS",
        message: "Already in target status",
      });
      continue;
    }
    try {
      assertTransition(existing.status, input.toStatus);
    } catch (e) {
      if (e instanceof AppError && e.code === "INVALID_STATUS_TRANSITION") {
        skipped.push({ id, code: e.code, message: e.message });
        continue;
      }
      throw e;
    }
    const updated = await updateApplication(userId, id, {
      status: input.toStatus,
    });
    moved.push(updated);
  }

  return { moved, skipped };
}
```

- [ ] **Step 4: Route** `POST /board/bulk-status` before `/:id`

- [ ] **Step 5: PASS + commit** `feat: add board bulk-status endpoint`

---

### Task 5: Web `canTransition` mirror

**Files:**

- Create: `apps/web/src/lib/status-transitions.ts`
- Create: `apps/web/src/lib/status-transitions.test.ts`
- Modify: `apps/web/package.json` — `vitest` + `"test": "vitest run"`
- Modify: `apps/web/src/lib/types.ts` — `boardOrder: number` on `Application`

**Interfaces:**

- Produces: `canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean`

**Pinned:** Vitest on web only. No alternate test locations.

- [ ] **Step 1: Install + script**

```bash
npm install -D vitest -w apps/web
```

`"test": "vitest run"` in `apps/web/package.json`.

- [ ] **Step 2: Implement** (verbatim)

```ts
import type { ApplicationStatus } from "./types";

const TERMINAL = new Set<ApplicationStatus>(["OFFER", "REJECTED", "WITHDRAWN"]);
const WITHDRAWN_REOPEN = new Set<ApplicationStatus>(["SAVED", "APPLIED"]);

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (from === to) return true;
  if (!TERMINAL.has(from)) return true;
  if (TERMINAL.has(to)) return true;
  return from === "WITHDRAWN" && WITHDRAWN_REOPEN.has(to);
}
```

- [ ] **Step 3: Tests** — 7 cases: SAVED→APPLIED true; APPLIED→OFFER true; OFFER→APPLIED false; REJECTED→WITHDRAWN true; WITHDRAWN→SAVED true; WITHDRAWN→SCREENING false; OFFER→OFFER true

- [ ] **Step 4: `boardOrder: number` on `Application` in `types.ts`**

- [ ] **Step 5: Commit** `feat: add web canTransition mirror for board`

---

### Task 6: Board page scaffold — nav, load, group, layout

**Files:**

- Modify: `AppNav.tsx`, `App.tsx`
- Create: `BoardPage.tsx` (+ optional `components/board/*`)

**Interfaces:**

- Consumes: `ApplicationListResponse`, `APPLICATION_STATUSES`, `apiClient`, QueryClient from `main.tsx`
- Produces: read-only `/board` UI

- [ ] **Step 1: Fetch + group**

```ts
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationListResponse,
  type ApplicationStatus,
  type Priority,
} from "../lib/types";

const BOARD_PRIORITY_LANES = [
  "HIGH",
  "MEDIUM",
  "LOW",
] as const satisfies readonly Priority[];

// useQuery({ queryKey: ["applications", "board"], queryFn: () =>
//   apiClient<ApplicationListResponse>(
//     "/api/applications?pageSize=100&sort=updatedAt&order=desc&page=1",
//   ) })

function groupForBoard(items: Application[]) {
  const cells = {} as Record<
    ApplicationStatus,
    Record<Priority, Application[]>
  >;
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
```

- [ ] **Step 2: Render** — `APPLICATION_STATUSES` columns; `region` + `aria-label={status}`; lanes `BOARD_PRIORITY_LANES` + counts; card company/title/priority **text**; card body → `/applications/:id`

- [ ] **Step 3: Truncation** if `total > items.length`

- [ ] **Step 4: AppNav** — Board link + `focus-visible:` styles on links

- [ ] **Step 5: Commit** `feat: add Kanban board page scaffold`

---

### Task 7: Single-card DnD (status, lane, reorder) + a11y base

**Files:**

- Modify: `apps/web/package.json` — `@dnd-kit/*`
- Modify: `BoardPage.tsx` / board components

**Interfaces:**

- Consumes: Tasks 3–5 + `canTransition`
- Produces: single-card interactions + sensors/live region/focus/reduced-motion

**Droppable / draggable id scheme (locked):**

| Kind | Id format | Example |
| --- | --- | --- |
| Column | `column:{status}` | `column:APPLIED` |
| Lane/cell | `cell:{status}:{priority}` | `cell:APPLIED:HIGH` |
| Card | `card:{applicationId}` | `card:clxyz…` |

Parse on `onDragEnd`: if over `column:*` → status move; if over `cell:*` same status different priority → lane; if over `cell:*` same status+priority (or sortable within cell) → reorder.

- [ ] **Step 1: Install**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities -w apps/web
```

- [ ] **Step 2: Sensors + reduced motion**

```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  }),
);
```

Skip/shorten overlay animation when `prefers-reduced-motion: reduce`.

- [ ] **Step 3: Drag handle only** — card body click/Enter navigates; handle uses dnd listeners

- [ ] **Step 4: Live region** — `<div role="status" aria-live="polite" className="sr-only">` (or visible); set message strings on outcomes

- [ ] **Step 5: Cross-column (single)**

```ts
await apiClient<ApplicationResponse>(`/api/applications/${id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: toStatus }),
});
```

Only if `canTransition(from, to)`; else announce error. Same status + no index change → no API. Then `queryClient.invalidateQueries({ queryKey: ["applications", "board"] })` and restore focus to moved card.

- [ ] **Step 6: Within-cell reorder**

```ts
await apiClient<{ ok: true }>("/api/applications/board/reorder", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    status,
    priority,
    orderedIds, // full cell id list after drag
  }),
});
```

- [ ] **Step 7: Cross-lane single** — `PATCH { priority }` + invalidate + focus

- [ ] **Step 8: Commit** `feat: add single-card Kanban drag interactions`

---

### Task 8: Multi-select + bulk-status on board

**Files:**

- Modify: `BoardPage.tsx` / board components

**Interfaces:**

- Consumes: Task 4 `POST /board/bulk-status`, Task 7 DnD context
- Produces: multi-select + bulk column drop; multi→lane no-op

- [ ] **Step 1: Selection state** — `Set<string>` of application ids; Cmd/Ctrl-click toggles; Escape clears; announce count in live region

- [ ] **Step 2: Multi-drag to column**

```ts
await apiClient<{
  moved: Application[];
  skipped: { id: string; code: string; message: string }[];
}>("/api/applications/board/bulk-status", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ids: [...selectedIds], toStatus }),
});
```

Announce `Moved ${moved.length}, skipped ${skipped.length}`. Invalidate board query. Clear selection on success.

- [ ] **Step 3: Multi → lane** — no API; announce unsupported

- [ ] **Step 4: Commit** `feat: add Kanban multi-select bulk status moves`

---

### Task 9: Docs + a11y checklist + gate

**Files:**

- Modify: `README.md`, `docs/PROJECT_CONTEXT.md`

- [ ] **Step 1: README** — Phase 3 endpoints (`/board/reorder`, `/board/bulk-status`), skip codes, pageSize 100, board UX, **manual a11y checklist** (keyboard column/lane/reorder, live region, reduced motion, drag handle vs click)

- [ ] **Step 2: PROJECT_CONTEXT** — Phase 3 status on branch/`main` when merged; next = interviews

- [ ] **Step 3: Gate**

```bash
npm run lint && npm run typecheck && npm run test && npm run test -w apps/web && npm run build
```

- [ ] **Step 4: Commit** `docs: add Phase 3 Kanban README and context`

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| `boardOrder` + index + backfill | 1 |
| pageSize max 100 | 1 |
| Create append | 1 |
| PATCH placement + dual + priorityRank | 2 |
| Delete gaps | 2 |
| Reorder exact set + `{ ok: true }` | 3 |
| Bulk sequential + skips + dedupe | 4 |
| `/board/*` before `/:id` | 3–4 |
| `canTransition` web | 5 |
| Board UI load/group/truncation | 6 |
| Single DnD + a11y base | 7 |
| Multi + bulk | 8 |
| Docs + gate | 9 |
| Non-goals | respected |

## Plan self-review (SDD)

- Spec coverage: complete table above
- No placeholders / alternate rulings
- Types exported: `BoardReorderBody`, `BoardBulkStatusBody`, `boardOrder` on FE Application
- HTTP test CSRF pattern inlined; FE `Content-Type` + queryKey inlined
- Droppable id scheme locked for Task 7
- Task 7/8 split so each review gate is bounded
- Worktree + prisma generate in Subagent notes
- Gate includes `apps/web` tests

## Residual thin (OK)

- Exact Tailwind/motion tokens
- Live-region copy for `ALREADY_IN_STATUS`
- Board file split under `components/board/`
- Parallel create `boardOrder` collisions

---

## Execution handoff

Plan: `docs/superpowers/plans/2026-10-01-nextrole-phase3.md`

**1. Subagent-Driven (recommended)** · **2. Inline Execution**

Which approach?

# NextRole Phase 3 Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/board` Kanban with 8 status columns × priority swimlanes, drag status/reorder/lane, multi bulk-status, `boardOrder` APIs, FE `canTransition`, and a11y/UX gate — per Phase 3 design.

**Architecture:** Extend Phase 2 applications module with `boardOrder` + `POST /board/reorder` + `POST /board/bulk-status` (routes before `/:id`). Web: `@dnd-kit` board page grouping list fetch; mirror transition rules; drag handle + live region.

**Tech Stack:** Existing monorepo — Fastify, Prisma, Zod, Vitest, React, Vite, TanStack Query, Tailwind; add `@dnd-kit/core` + `@dnd-kit/sortable` (+ utilities as needed).

**Spec:** `docs/superpowers/specs/2026-10-01-nextrole-phase3-design.md` (binding).

## Subagent notes

- Workdir: `/Users/aniisabihi/Git/Me/NextRole`
- Branch: `feat/phase-3-kanban` from latest `main`
- Patterns: `modules/applications/*`, `tests/helpers/applications.ts`, `AppNav`, `apiClient`
- Spec wins on conflict; document deviations in README
- Never commit `.env`
- No interviews / BullMQ / analytics
- Register `/board/*` **before** `/:id`

## Global Constraints

- Ownership: `userId` on every query; cross-user → skip `NOT_FOUND` (bulk) or `404`/`400` per endpoint rules
- Mutations: CSRF + Origin unchanged
- Soft status matrix via `assertTransition` / FE `canTransition`
- `boardOrder` within `(userId, status, priority)`; `priorityRank` still updated on priority write
- List `pageSize` max **100**
- Reorder: exact full cell `orderedIds`; `{ ok: true }`; last-write-wins
- Bulk: sequential; dedupe max 100; skip `NOT_FOUND` | `INVALID_STATUS_TRANSITION` | `ALREADY_IN_STATUS`; `moved` = full Application rows
- Dual PATCH → one append at final `(status, priority)` cell
- A11y gate from spec (keyboard, live region, AA, reduced-motion, drag handle)
- Gate: lint + typecheck + test + build

---

## File map

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/**/add_board_order/**
apps/api/src/modules/applications/
  board-order.ts              # nextBoardOrderInCell helper
  schemas.ts                  # pageSize max 100; reorder + bulk schemas
  applications.service.ts     # create/update placement; reorder; bulkStatus
  routes.ts                   # /board/* before /:id
apps/api/tests/applications/
  board-order.test.ts         # optional unit for helper
  applications.board.test.ts  # reorder + bulk + route shadow + pageSize 100
apps/web/package.json         # @dnd-kit/*
apps/web/src/lib/status-transitions.ts
apps/web/src/lib/types.ts     # boardOrder on Application
apps/web/src/components/AppNav.tsx
apps/web/src/pages/BoardPage.tsx
apps/web/src/components/board/   # optional split: BoardColumn, BoardCard, …
apps/web/src/App.tsx
README.md
docs/PROJECT_CONTEXT.md
```

---

### Task 1: Schema `boardOrder` + pageSize 100 + create append

**Files:**

- Modify: `apps/api/prisma/schema.prisma` — add `boardOrder Int @default(0)` + `@@index([userId, status, priority, boardOrder])`
- Create: migration `add_board_order` (SQL backfill per cell by `updatedAt DESC`)
- Modify: `apps/api/src/modules/applications/schemas.ts` — `pageSize` `.max(100)`
- Modify: `apps/api/src/modules/applications/applications.service.ts` — create appends `boardOrder`
- Create: `apps/api/src/modules/applications/board-order.ts` — shared helper

**Produces:** `nextBoardOrderInCell(tx, userId, status, priority): Promise<number>`

- [ ] **Step 1: Add helper**

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

- [ ] **Step 2: Schema + migrate**

```prisma
  boardOrder         Int               @default(0)
  // …
  @@index([userId, status, priority, boardOrder])
```

```bash
npm run db:migrate:dev -w apps/api -- --name add_board_order
```

Backfill in migration SQL (or follow-up SQL in same migration): for each distinct `(user_id, status, priority)`, set `board_order` = row_number()-1 ordered by `updated_at DESC`.

- [ ] **Step 3: pageSize max 100** in `listApplicationsQuerySchema`

- [ ] **Step 4: createApplication** — after resolving `status`/`priority`, set `boardOrder: await nextBoardOrderInCell(tx, userId, status, priority)` inside the existing transaction **before** create (aggregate excludes the new row — correct).

- [ ] **Step 5: Test** — create two apps same status+priority → `boardOrder` 0 then 1; `pageSize=100` OK; `101` → 400

- [ ] **Step 6: Commit** `feat: add application boardOrder and raise list pageSize to 100`

---

### Task 2: updateApplication boardOrder placement

**Files:**

- Modify: `applications.service.ts` `updateApplication`
- Test: extend CRUD or `applications.board.test.ts`

**Consumes:** `nextBoardOrderInCell`  
**Produces:** status/priority/dual PATCH place card at end of final cell; keep `priorityRank`

- [ ] **Step 1: Failing tests**

| Case | Expect |
| --- | --- |
| PATCH status only | `boardOrder` = end of `(newStatus, oldPriority)` |
| PATCH priority only | `boardOrder` = end of `(oldStatus, newPriority)`; `priorityRank` updated |
| PATCH both | one placement at `(newStatus, newPriority)` |
| Same status no-op | no `boardOrder` change (existing early return) |

- [ ] **Step 2: Implement** — after computing `nextStatus` / priority in patch loop, determine:

```ts
const finalStatus = statusChanging ? nextStatus! : existing.status;
const finalPriority =
  "priority" in /* changed */ ? (patch.priority as Priority) : existing.priority;
const cellChanged =
  statusChanging ||
  (patch.priority !== undefined && patch.priority !== existing.priority);
if (cellChanged) {
  data.boardOrder = await nextBoardOrderInCell(
    tx, // must move placement inside transaction after locks — see Step 2b
    userId,
    finalStatus,
    finalPriority,
  );
}
```

**Step 2b:** Compute `boardOrder` **inside** the `$transaction`, using `tx`, after validating transitions — so append sees concurrent commits. If current code loads `existing` outside tx, keep validation outside; set `boardOrder` inside tx via helper.

- [ ] **Step 3: PASS + commit** `feat: place boardOrder on status and priority updates`

---

### Task 3: POST `/board/reorder`

**Files:**

- Modify: `schemas.ts` — `boardReorderSchema`
- Modify: `applications.service.ts` — `reorderBoardCell`
- Modify: `routes.ts` — register **before** `/:id`
- Test: `applications.board.test.ts`

**Produces:**

```ts
reorderBoardCell(
  userId: string,
  input: { status: ApplicationStatus; priority: Priority; orderedIds: string[] },
): Promise<{ ok: true }>
```

- [ ] **Step 1: Schema**

```ts
export const boardReorderSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  priority: z.nativeEnum(Priority),
  orderedIds: z.array(z.string().min(1)).min(1).max(100),
});
```

- [ ] **Step 2: Failing HTTP tests** — reorder happy; incomplete set → 400; duplicate ids → 400; foreign id → 400; empty → 400

- [ ] **Step 3: Implement service**

```ts
export async function reorderBoardCell(userId: string, input: BoardReorderBody) {
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
        where: { id: input.orderedIds[i] },
        data: { boardOrder: i },
      });
    }
    return { ok: true as const };
  });
}
```

- [ ] **Step 4: Route**

```ts
app.post("/board/reorder", { preHandler: [authGuard] }, async (request) => {
  const body = parseBody(boardReorderSchema, request.body);
  return applicationsService.reorderBoardCell(request.userId!, body);
});
```

Place this (and Task 4 bulk route) **above** `app.get("/:id", …)`.

- [ ] **Step 5: PASS + commit** `feat: add board cell reorder endpoint`

---

### Task 4: POST `/board/bulk-status`

**Files:**

- Modify: `schemas.ts` — `boardBulkStatusSchema`
- Modify: `applications.service.ts` — `bulkUpdateStatus`
- Modify: `routes.ts`
- Test: `applications.board.test.ts`

**Produces:**

```ts
bulkUpdateStatus(
  userId: string,
  input: { ids: string[]; toStatus: ApplicationStatus },
): Promise<{ moved: Application[]; skipped: { id: string; code: string; message: string }[] }>
```

- [ ] **Step 1: Schema**

```ts
export const boardBulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  toStatus: z.nativeEnum(ApplicationStatus),
});
```

- [ ] **Step 2: Failing tests** — mixed move/skip transition; `ALREADY_IN_STATUS`; `NOT_FOUND`; dedupe; activities only for moved; priority preserved; sequential boardOrder in target cell

- [ ] **Step 3: Implement**

```ts
export async function bulkUpdateStatus(userId: string, input: BoardBulkStatusBody) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of input.ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > 100) {
    throw new AppError("VALIDATION_ERROR", 400, "Too many ids");
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

Prefer calling shared internal update that already handles `boardOrder` (Task 2). If `updateApplication` public API is fine, use it (sequential — satisfies race note).

- [ ] **Step 4: Route** `POST /board/bulk-status` before `/:id`

- [ ] **Step 5: Assert `/board/reorder` is not treated as `/:id`** — POST returns validation/ok, not application NOT_FOUND with id=`board`

- [ ] **Step 6: PASS + commit** `feat: add board bulk-status endpoint`

---

### Task 5: Web `canTransition` mirror

**Files:**

- Create: `apps/web/src/lib/status-transitions.ts`
- Create: `apps/web/src/lib/status-transitions.test.ts` (Vitest if web has it — **or** colocate tests under `apps/api` parity file that imports duplicated cases; prefer add `vitest` to web **only if already trivial**. Simpler: put FE matrix tests in `apps/api/tests/applications/can-transition-parity.test.ts` documenting the web file must match — **Ruling:** add web vitest script only if package already supports; else unit-test a **copied** pure function by extracting expected matrix table in `apps/web` and run via `apps/api` test importing from a shared **duplicate** test table in the plan.

**Pinned approach:** Implement `canTransition` in web; add `apps/web` vitest as `vitest` + script mirroring api (lightweight) **or** test file under api that re-implements the same assertions the web file documents. Prefer:

```bash
npm install -D vitest -w apps/web
```

only if Task 5 needs it — alternatively export nothing from api and duplicate test cases in markdown. **Best:** add `apps/web/src/lib/status-transitions.test.ts` and `"test": "vitest run"` to web; root `npm test` already workspace api only — run `npm run test -w apps/web` in gate for Phase 3 **or** fold web unit into api gate by testing identical logic strings.

**Ruling for plan:** Copy matrix into web; add web vitest + include `npm run test -w apps/web` in Task 8 gate.

- [ ] **Step 1: Implement** (mirror API logic; return boolean)

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

- [ ] **Step 2: Tests** — same 7 cases as API `status-transitions.test.ts`

- [ ] **Step 3: Add `boardOrder` to `Application` type** in `types.ts`

- [ ] **Step 4: Commit** `feat: add web canTransition mirror for board`

---

### Task 6: Board page scaffold — nav, load, group, layout

**Files:**

- Modify: `AppNav.tsx` — Board link
- Modify: `App.tsx` — `/board` route
- Create: `BoardPage.tsx` (+ optional `components/board/*`)
- Polish: visual hierarchy, column/lane landmarks, truncation banner

**Produces:** Read-only board UI (no DnD yet) showing all 8 columns × 3 lanes

- [ ] **Step 1: Fetch**

```ts
apiClient<ListResponse>(
  "/api/applications?pageSize=100&sort=updatedAt&order=desc&page=1",
);
```

Group:

```ts
const STATUSES = [/* APPLICATION_STATUSES order */];
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
// cells[status][priority] = apps sorted by boardOrder asc
```

- [ ] **Step 2: Render** scrollable columns; lane regions; counts; card shows company/title/priority text (not color-only); link/button to detail on card body

- [ ] **Step 3: Truncation** if `total > items.length` — banner + link to `/applications`

- [ ] **Step 4: AppNav focus-visible styles** (light consistency)

- [ ] **Step 5: Commit** `feat: add Kanban board page scaffold`

---

### Task 7: DnD — status, lane, reorder, multi-select

**Files:**

- Modify: `apps/web/package.json` — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- Modify: `BoardPage.tsx` / board components

**Produces:** Full interactions per spec

- [ ] **Step 1: Install**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities -w apps/web
```

- [ ] **Step 2: Drag handle** on card; card body → `navigate(/applications/:id)`

- [ ] **Step 3: Cross-column** (single) — if `canTransition` then `PATCH { status }` else announce error; same status no index change → no API

- [ ] **Step 4: Within-cell reorder** — on drag end, build full `orderedIds` for cell → `POST /api/applications/board/reorder`

- [ ] **Step 5: Cross-lane single** — `PATCH { priority }`

- [ ] **Step 6: Multi-select** Cmd/Ctrl-click; Escape clears; aria selection count

- [ ] **Step 7: Multi → column** — `POST …/bulk-status`; live region Moved/skipped; multi → lane → no-op message

- [ ] **Step 8: Invalidate** TanStack Query on success; `prefers-reduced-motion` for animations

- [ ] **Step 9: Commit** `feat: wire Kanban drag drop multi-select and board APIs`

---

### Task 8: Docs + a11y checklist + gate

**Files:**

- Modify: `README.md` — Phase 3 section (endpoints, board UX, a11y checklist, pageSize 100)
- Modify: `docs/PROJECT_CONTEXT.md` — Phase 3 done/in-progress on branch; next phases
- Manual a11y pass checklist ticked in README

- [ ] **Step 1: README** — board routes, reorder/bulk contracts, skip codes, a11y manual steps

- [ ] **Step 2: PROJECT_CONTEXT** — roadmap row Phase 3

- [ ] **Step 3: Gate**

```bash
npm run lint && npm run typecheck && npm run test && npm run test -w apps/web && npm run build
```

(If web test script missing until Task 5, ensure it exists.)

- [ ] **Step 4: Commit** `docs: add Phase 3 Kanban README and context`

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| `boardOrder` + index + backfill | 1 |
| pageSize max 100 | 1 |
| Create append | 1 |
| PATCH placement + dual cell + priorityRank | 2 |
| Reorder exact set + `{ ok: true }` | 3 |
| Bulk sequential + skips + dedupe | 4 |
| `/board/*` before `/:id` | 3–4 |
| `canTransition` web | 5 |
| Board UI load/group/truncation | 6 |
| DnD + multi + a11y behaviors | 7 |
| Docs + gate | 8 |
| Non-goals | respected |

## Plan self-review

- Spec coverage: mapped above  
- Placeholders: none intentional; backfill SQL left to implementer to write correct Postgres `UPDATE … FROM (row_number())` in migration  
- Types: `boardOrder` on Application; bulk `moved: Application[]`  
- Route order called out in Tasks 3–4  

## Residual thin (OK)

- Exact Tailwind/motion tokens  
- Live-region copy for `ALREADY_IN_STATUS`  
- Whether board components split into multiple files  

---

## Execution handoff

Plan: `docs/superpowers/plans/2026-10-01-nextrole-phase3.md`

**1. Subagent-Driven (recommended)** · **2. Inline Execution**

Which approach?

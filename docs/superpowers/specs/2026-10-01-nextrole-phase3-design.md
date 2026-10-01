# NextRole — Phase 3 Design (Kanban)

**Date:** 2026-10-01  
**Status:** Approved — implementation plan next (review fixes applied)  
**Path:** `~/Git/Me/NextRole`  
**Depends on:** Phase 2 applications core (`docs/superpowers/specs/2026-09-30-nextrole-phase2-design.md`)

## Goal

Ship an accessible, polished **Kanban board** on top of Phase 2 applications: eight status columns, priority swimlanes, drag-to-change-status, within-cell reorder, multi-select bulk status moves, FE transition pre-checks mirroring server `assertTransition`. Raise the UX/a11y bar for this surface (and keep that bar for later phases)—do not defer polish to a later refactor.

Stop before interviews, reminders/BullMQ, and dashboard analytics.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Approach | Rich board (reorder + swimlanes + multi-select), not status-only MVP |
| Columns | All 8 `ApplicationStatus` values |
| Swimlanes | By **priority**: HIGH → MEDIUM → LOW |
| Cross-column drag | Status change via existing transition rules |
| Within-cell drag | Persist `boardOrder` via reorder API (same status + same priority) |
| Same status, no reorder | Drop onto column chrome / same status with **no index change** → **no API** |
| Cross-lane (same column) | Single-card only: `PATCH` `priority` + append `boardOrder` in new cell |
| Multi → other lane | **Unsupported** (status bulk only; ignore / no-op lane multi-drop) |
| Multi-select | Bulk **status** drop only; illegal / already-there cards skipped + reported |
| Bulk status placement | Preserve each card’s **priority**; append to end of `(toStatus, thatPriority)` cell |
| Bulk already at target | Skip with code `ALREADY_IN_STATUS` (no activity, no boardOrder rewrite) |
| Bulk `ids` | Dedupe preserving first-seen order; **max 100** ids |
| Illegal single drop | FE blocks via `canTransition`; server still validates |
| Board load | List endpoint; client groups/sorts; **`pageSize` max raised to 100** |
| Truncation | Cap is approximate (`sort=updatedAt`); overflow → banner + Applications list |
| Reorder API | Dedicated atomic `POST …/board/reorder`; response `{ ok: true }` |
| Reorder membership | `orderedIds` must be **exact full set** of ids currently in that cell; max 100 |
| Concurrent reorder | Last-write-wins (no cell versioning in Phase 3) |
| Bulk status API | Dedicated `POST …/board/bulk-status`; process **sequentially** in request |
| Dual PATCH | If `status` and `priority` both change: one placement at end of **final** cell `(newStatus, newPriority)` |
| `priorityRank` | Unchanged Phase 2 rule: always update `priorityRank` when `priority` is written |
| Delete + `boardOrder` | No compact-on-delete; gaps OK (sort by `boardOrder` still works) |
| Route order | Register `/board/*` **before** `/:id` so `"board"` is not captured as an id |
| Transition mirror | Duplicate pure `canTransition` in web (no shared package) |
| DnD | `@dnd-kit` with pointer + keyboard sensors; **drag handle** (click card → detail) |
| Kanban cards | Interaction containers (allowed “card” exception for this surface) |
| Bulk `moved` payload | Full `Application` rows (not ids-only) |
| UX/a11y | First-class gate for Phase 3+ (see below) |
| Touch multi-select | Cmd/Ctrl-click is primary; no mobile checkbox multi in v1 |
| Non-goals | Interviews, BullMQ, analytics, file uploads, custom columns, multi-reorder within cell, multi lane-move, shared workspace package, optimistic concurrency on reorder |

## Architecture

```text
Browser /board
  │  GET /api/applications?pageSize=100&sort=updatedAt&order=desc
  │  group by status × priority; sort boardOrder
  │  canTransition(from, to)  // web mirror
  ▼
Fastify modules/applications
  │  POST /api/applications/board/reorder      // register BEFORE /:id
  │  POST /api/applications/board/bulk-status
  │  PATCH /:id { status | priority | … }      // boardOrder + priorityRank side-effects
  │  assertTransition (unchanged matrix)
  ▼
PostgreSQL Application (+ boardOrder; priorityRank unchanged)
```

Follow Phase 1–2: thin routes, Zod, services, Prisma, no repository layer, no shared package.

## UX / accessibility principle

**Continuously ship accessible + modern UI** with each phase. Phase 3 board sets the visual/a11y bar; light consistency fixes to AppNav/list are allowed. No “we’ll fix a11y in a big refactor later.”

Acceptance (Phase 3 gate):

- Keyboard: reach board, move between columns/lanes, reorder within cell without pointer (`@dnd-kit` keyboard sensors)—verify in README checklist.
- Focus-visible on controls; focus restored after drop to moved card / selection.
- Landmarks: `<main>`; each column a labeled region.
- Live region (or equivalent) announces move / bulk “Moved N, skipped M”.
- WCAG AA contrast for text/controls; status/priority not color-only (text/icons too).
- Respect `prefers-reduced-motion` for drag/settle motion.
- Practical hit targets (~44px) where reasonable.
- Drag via **handle** so primary click/Enter on card opens detail without starting a drag.

Visual: intentional hierarchy and spacing on existing Tailwind tokens—elevate Phase 2’s functional look; do not invent a second design system or generic “AI purple” chrome. Board cards are the interaction unit for Kanban (explicit exception to “default: no cards” for this surface).

## Data model

### Schema addition

On `Application`:

- `boardOrder Int @default(0)` — order within cell `(userId, status, priority)`
- Index: `@@index([userId, status, priority, boardOrder])`
- Keep existing `priorityRank` (Phase 2); do not remove or stop maintaining it.

### Migration backfill

For each `(userId, status, priority)` group, set `boardOrder = 0..n-1` ordered by `updatedAt desc` (stable enough for v1).

### Side-effects on writes

- **Create:** append `boardOrder = max+1` (or `0`) in the create `(status, priority)` cell — same placement rule as moves (avoid default-`0` collisions). Set `priorityRank` as Phase 2.
- **Status change only:** place card at end of `(toStatus, currentPriority)`. Emit `STATUS_CHANGED`.
- **Priority change only:** place at end of `(currentStatus, newPriority)`; update `priorityRank`. Emit `FIELDS_UPDATED` for priority when via field update / priority PATCH.
- **Status + priority in one PATCH:** compute final cell `(newStatus, newPriority)`; single append there; update `priorityRank`; emit both activity types as Phase 2 rules (status change + field diff) when applicable.
- **Bulk status:** only when `from !== toStatus`; append in `(toStatus, card.priority)`; update nothing on priority.
- **Reorder only:** rewrite `boardOrder` values; **no** activity rows.
- **Delete:** hard delete as Phase 2; **do not** renumber remaining `boardOrder` (gaps OK).

## API

All routes authenticated. Mutations: existing CSRF + Origin.

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/applications` | List envelope; **`pageSize` max = 100** (Phase 3 schema change) |
| `PATCH` | `/api/applications/:id` | + `boardOrder` / `priorityRank` placement rules above |
| `POST` | `/api/applications/board/reorder` | `200 { ok: true }` |
| `POST` | `/api/applications/board/bulk-status` | `200 { moved: Application[], skipped: { id, code, message }[] }` |

**Routing:** In `routes.ts`, register both `/board/reorder` and `/board/bulk-status` **before** any `/:id` routes.

### `POST /api/applications/board/reorder`

Body:

```json
{
  "status": "APPLIED",
  "priority": "HIGH",
  "orderedIds": ["cuid1", "cuid2", "cuid3"]
}
```

Rules:

- Empty `orderedIds` → `400 VALIDATION_ERROR`.
- `orderedIds.length` > 100 → `400 VALIDATION_ERROR`.
- Load all applications for caller in that `(status, priority)` cell.
- `orderedIds` must contain **exactly** those ids (same set, same length, no extras/missing, duplicates forbidden) → else `400 VALIDATION_ERROR` listing the problem.
- Missing / not-owned id appearing in `orderedIds` → whole reorder fails `400` (not partial).
- Atomically set `boardOrder` to index in `orderedIds`.
- Concurrent editors: **last-write-wins** (no cell etag in Phase 3).

### `POST /api/applications/board/bulk-status`

Body:

```json
{
  "ids": ["cuid1", "cuid2"],
  "toStatus": "SCREENING"
}
```

Rules:

- Empty `ids` → `400 VALIDATION_ERROR`.
- Dedupe `ids` preserving first-seen order; if > 100 unique → `400 VALIDATION_ERROR`.
- Process **sequentially** in (deduped) request order.
- Each id: own transaction (or sequential steps) so one failure doesn’t roll back prior successes.
- Not found / not owned → skip `NOT_FOUND` (no existence leak beyond skip).
- Already `status === toStatus` → skip `ALREADY_IN_STATUS` (no activity, no boardOrder change).
- `assertTransition` fail → skip `INVALID_STATUS_TRANSITION`.
- Success → status PATCH semantics: `STATUS_CHANGED` + append in `(toStatus, card.priority)` (**priority preserved**).
- Response always `200` with `moved` (full Application rows) / `skipped` arrays.

### List / board load

- FE: `GET /api/applications?pageSize=100&sort=updatedAt&order=desc`.
- Client groups by `status` × `priority`, sorts each cell by `boardOrder` asc.
- If `total > pageSize`: truncation banner + link to Applications list. **Limitation:** overflow set is “most recently updated,” not “missing from middle of a column”—list remains source of truth for full data.

## Frontend

| Route | Purpose |
| --- | --- |
| `/board` | Kanban board |
| Existing `/applications*` | Unchanged primary CRUD |

- AppNav: Dashboard · Applications · Board.
- Card body click / Enter → detail; **drag handle** initiates DnD (no accidental navigate).
- Single-card cross-column to **different** status → status API if `canTransition`; else no-op + error announcement.
- Single-card drop on same status with **no cell index change** → no API.
- Single-card **within-cell reorder** → `POST …/board/reorder` with full cell `orderedIds`.
- Single-card cross-lane → priority PATCH (updates `priorityRank` + `boardOrder` append).
- Multi-select: Cmd/Ctrl-click toggle; Escape clears; announce selection count. No dedicated touch multi-select in v1.
- Multi-drag to **column** → `bulk-status`; live region “Moved N, skipped M” (include already-in-status skips in M or call out separately).
- Multi-drag to **lane** → unsupported (no-op + brief message).
- Shift-range select: **out of v1**.
- Library: `@dnd-kit`.
- Mirror: `apps/web/src/lib/status-transitions.ts` with `canTransition` matching API matrix (`from === to` → true / allow no-op). Unit-test parity with API cases.

## Testing

### API

- Create appends `boardOrder` in cell; sets `priorityRank`.
- Backfill migration + `boardOrder` indexes; `priorityRank` still correct after priority PATCH.
- Dual PATCH status+priority → single final-cell placement.
- Reorder happy path; reject incomplete/extra/duplicate/`orderedIds` > 100; ownership/missing → `400`.
- Bulk: mixed legal/illegal/already-in-status; dedupe; max 100; sequential append; activities only for moved; priority preserved.
- Status PATCH appends `boardOrder` in target cell.
- Priority change appends in new lane cell + updates `priorityRank`.
- Delete leaves gaps; remaining order still sorts.
- `/board/*` not shadowed by `/:id` (integration: POST board paths return 200/400, not application 404).
- Phase 2 transition + CRUD regress green.
- List `pageSize=100` accepted; `101` → validation error.

### FE / a11y

- Manual checklist in README (keyboard column/lane/reorder, live region, reduced motion, drag handle vs click).
- Unit tests for `canTransition` matrix parity with API cases (incl. same-status no-op).
- Light component tests only if low-cost; no heavy E2E required in Phase 3.

### Gate

`npm run lint && npm run typecheck && npm run test && npm run build`

## Success criteria

1. `/board` supports status drag, within-cell reorder, single-card priority-lane move, multi bulk-status.
2. Server enforces transitions + ownership; FE `canTransition` matches matrix.
3. A11y/UX acceptance list above met.
4. README + `docs/PROJECT_CONTEXT.md` updated for Phase 3.
5. Non-goals respected.

## Non-goals (Phase 3)

Interviews, reminders/BullMQ/Redis app usage, dashboard analytics, file uploads, customizable columns, within-cell multi-card reorder, multi-select lane moves, dedicated `GET /board` payload, shared monorepo package for transitions, optimistic concurrency / etags for reorder, mobile checkbox multi-select, compacting `boardOrder` on delete.

## Spec self-review (post-fix)

| Check | Result |
| --- | --- |
| pageSize | Locked max **100** everywhere |
| Reorder completeness | Exact full cell set required |
| Same-column vs reorder | Split: no-op vs reorder API |
| Create boardOrder | Append on create |
| Bulk already-in-status | `ALREADY_IN_STATUS` skip |
| Bulk ids | Dedupe + max 100 |
| Dual PATCH | Final cell placement |
| priorityRank | Still maintained |
| Route order | `/board/*` before `/:id` |
| Delete gaps | Explicit OK |
| Bulk moved | Full Application rows |
| A11y deferred? | No—gate items listed |

## Residual thin (OK for plan)

- Exact Tailwind tokens / motion durations
- Toast component vs aria-live only (live region required either way)
- Exact skip-count copy for `ALREADY_IN_STATUS` in the live region

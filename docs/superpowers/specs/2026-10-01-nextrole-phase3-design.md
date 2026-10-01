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
| Within-cell drag | Persist `boardOrder` |
| Cross-lane (same column) | Single-card only: `PATCH` `priority` + append `boardOrder` in new cell |
| Multi → other lane | **Unsupported** (status bulk only; ignore / no-op lane multi-drop) |
| Multi-select | Bulk **status** drop only; illegal cards skipped + reported |
| Bulk status placement | Preserve each card’s **priority**; append to end of `(toStatus, thatPriority)` cell |
| Illegal single drop | FE blocks via `canTransition`; server still validates |
| Same-column drop | `from === to` → no API call (no-op) |
| Board load | List endpoint; client groups/sorts; **`pageSize` max raised to 100** |
| Truncation | Cap is approximate (`sort=updatedAt`); overflow → banner + Applications list |
| Reorder API | Dedicated atomic `POST …/board/reorder`; response `{ ok: true }` |
| Reorder membership | `orderedIds` must be **exact full set** of ids currently in that cell |
| Concurrent reorder | Last-write-wins (no cell versioning in Phase 3) |
| Bulk status API | Dedicated `POST …/board/bulk-status`; process **sequentially** in request |
| Transition mirror | Duplicate pure `canTransition` in web (no shared package) |
| DnD | `@dnd-kit` with pointer + keyboard sensors; **drag handle** (click card → detail) |
| Kanban cards | Interaction containers (allowed “card” exception for this surface) |
| UX/a11y | First-class gate for Phase 3+ (see below) |
| Non-goals | Interviews, BullMQ, analytics, file uploads, custom columns, multi-reorder within cell, multi lane-move, shared workspace package, optimistic concurrency on reorder |

## Architecture

```text
Browser /board
  │  GET /api/applications?pageSize=100&sort=updatedAt&order=desc
  │  group by status × priority; sort boardOrder
  │  canTransition(from, to)  // web mirror
  ▼
Fastify modules/applications
  │  PATCH /:id { status | priority | … }   // existing + boardOrder side-effects
  │  POST /api/applications/board/reorder
  │  POST /api/applications/board/bulk-status
  │  assertTransition (unchanged matrix)
  ▼
PostgreSQL Application (+ boardOrder)
```

Follow Phase 1–2: thin routes, Zod, services, Prisma, no repository layer, no shared package.

## UX / accessibility principle

**Continuously ship accessible + modern UI** with each phase. Phase 3 board sets the visual/a11y bar; light consistency fixes to AppNav/list are allowed. No “we’ll fix a11y in a big refactor later.”

Acceptance (Phase 3 gate):

- Keyboard: reach board, move between columns/lanes, reorder within cell without pointer (`@dnd-kit` keyboard sensors).
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

### Migration backfill

For each `(userId, status, priority)` group, set `boardOrder = 0..n-1` ordered by `updatedAt desc` (stable enough for v1).

### Side-effects on writes

- **Create:** append `boardOrder = max+1` (or `0`) in the create `(status, priority)` cell — same placement rule as moves (avoid default-`0` collisions).
- **Status change** (single PATCH or bulk): place card at **end** of target `(toStatus, currentPriority)` cell (`max(boardOrder)+1`, or `0` if empty). Emit `STATUS_CHANGED` activity as Phase 2.
- **Priority change** (detail or **single-card** cross-lane drag): place at end of new `(status, priority)` cell. Emit `FIELDS_UPDATED` for priority when via field update / priority PATCH path.
- **Reorder only:** update `boardOrder` values; **no** activity rows (noise).

## API

All routes authenticated. Mutations: existing CSRF + Origin.

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/applications` | List envelope; **`pageSize` max = 100** (Phase 3 schema change) |
| `PATCH` | `/api/applications/:id` | Unchanged + `boardOrder` placement when `status` / `priority` change |
| `POST` | `/api/applications/board/reorder` | `200 { ok: true }` |
| `POST` | `/api/applications/board/bulk-status` | `200 { moved: Application[], skipped: { id, code, message }[] }` |

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
- Load all applications for caller in that `(status, priority)` cell.
- `orderedIds` must contain **exactly** those ids (same set, same length, no extras/missing, duplicates forbidden) → else `400 VALIDATION_ERROR` listing the problem.
- Missing / not-owned id appearing in `orderedIds` → treat as validation failure for the whole reorder (`400`), not partial apply.
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

- Process ids **sequentially** in request order (avoid parallel `boardOrder` races on the same target cell).
- Each id: own transaction (or sequential steps) so one failure doesn’t roll back prior successes.
- Not found / not owned → skip `NOT_FOUND` (no existence leak beyond skip).
- `assertTransition` fail → skip `INVALID_STATUS_TRANSITION`.
- Success → same as status PATCH: activity + append in `(toStatus, card.priority)` cell (**priority preserved**).
- Response always `200` with `moved` / `skipped` arrays (not multi-status HTTP).
- Empty `ids` → `400 VALIDATION_ERROR`.

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
- Single-card: cross-column → status API if `canTransition`; else no-op + error announcement. Same status column drop → no API.
- Single-card: cross-lane → priority PATCH.
- Multi-select: Cmd/Ctrl-click toggle; Escape clears; announce selection count.
- Multi-drag to **column** → `bulk-status`; live region “Moved N, skipped M”.
- Multi-drag to **lane** → unsupported (no-op + brief message).
- Shift-range select: **out of v1**.
- Library: `@dnd-kit`.
- Mirror: `apps/web/src/lib/status-transitions.ts` with `canTransition` matching API matrix (`from === to` → true / allow no-op). Unit-test parity with API cases.

## Testing

### API

- Create appends `boardOrder` in cell (no colliding defaults).
- Backfill migration + `boardOrder` indexes.
- Reorder happy path; reject incomplete/extra/duplicate `orderedIds`; ownership/missing → `400` for reorder.
- Bulk-status mixed legal/illegal → correct `moved` / `skipped`; activities only for moved; priority preserved; sequential append order stable for same target cell.
- Status PATCH appends `boardOrder` in target cell.
- Priority change appends in new lane cell.
- Phase 2 transition + CRUD regress green.
- List `pageSize=100` accepted; `101` → validation error.

### FE / a11y

- Manual checklist in README (keyboard move/reorder, live region, reduced motion, drag handle vs click).
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

Interviews, reminders/BullMQ/Redis app usage, dashboard analytics, file uploads, customizable columns, within-cell multi-card reorder, multi-select lane moves, dedicated `GET /board` payload, shared monorepo package for transitions, optimistic concurrency / etags for reorder.

## Spec self-review (post-fix)

| Check | Result |
| --- | --- |
| pageSize | Locked max **100** everywhere |
| Reorder completeness | Exact full cell set required |
| Create boardOrder | Append on create |
| Bulk priority | Preserved; sequential processing |
| Multi → lane | Unsupported |
| Concurrent reorder | Last-write-wins explicit |
| Reorder response | `{ ok: true }` |
| Drag vs click | Drag handle locked |
| A11y deferred? | No—gate items listed |

## Residual thin (OK for plan)

- Exact Tailwind tokens / motion durations
- Toast component vs aria-live only (live region required either way)
- Whether bulk `moved` returns full Application rows or ids only (prefer full rows as table states)

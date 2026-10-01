# NextRole — Phase 3 Design (Kanban)

**Date:** 2026-10-01  
**Status:** Approved — implementation plan next  
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
| Cross-lane (same column) | `PATCH` `priority` + append `boardOrder` in new cell |
| Multi-select | Bulk **status** drop only; illegal cards skipped + reported |
| Illegal single drop | FE blocks via `canTransition`; server still validates |
| Board load | Existing list endpoint; client groups/sorts; soft cap + truncation banner |
| Reorder API | Dedicated atomic `POST …/board/reorder` |
| Bulk status API | Dedicated `POST …/board/bulk-status` |
| Transition mirror | Duplicate pure `canTransition` in web (no shared package) |
| DnD | `@dnd-kit` with pointer + keyboard sensors |
| UX/a11y | First-class gate for Phase 3+ (see below) |
| Non-goals | Interviews, BullMQ, analytics, file uploads, custom columns, multi-reorder within cell, shared workspace package |

## Architecture

```text
Browser /board
  │  GET /api/applications?pageSize=100&…
  │  group by status × priority; sort boardOrder
  │  canTransition(from, to)  // web mirror
  ▼
Fastify modules/applications
  │  PATCH /:id { status | priority | … }   // existing + boardOrder side-effects
  │  POST /board/reorder
  │  POST /board/bulk-status
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

Visual: intentional hierarchy and spacing on existing Tailwind tokens—elevate Phase 2’s functional look; do not invent a second design system or generic “AI purple” chrome.

## Data model

### Schema addition

On `Application`:

- `boardOrder Int @default(0)` — order within cell `(userId, status, priority)`
- Index: `@@index([userId, status, priority, boardOrder])`

### Migration backfill

For each `(userId, status, priority)` group, set `boardOrder = 0..n-1` ordered by `updatedAt desc` (stable enough for v1).

### Side-effects on writes

- **Status change** (single PATCH or bulk): place card at **end** of target status cell for its current priority (`max(boardOrder)+1`, or `0` if empty). Emit `STATUS_CHANGED` activity as Phase 2.
- **Priority change** (detail or cross-lane drag): place at end of new `(status, priority)` cell. Emit `FIELDS_UPDATED` for priority when via field update path; lane drag may use same PATCH priority semantics.
- **Reorder only**: update `boardOrder` values; **no** activity rows (noise).

## API

All routes authenticated. Mutations: existing CSRF + Origin.

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/applications` | Unchanged list envelope; board uses high `pageSize` (max stays **50** unless raised—see Open pin) |
| `PATCH` | `/api/applications/:id` | Unchanged + `boardOrder` placement rules when `status` / `priority` change |
| `POST` | `/api/applications/board/reorder` | `200` `{ items: Application[] }` or `{ ok: true }` for that cell |
| `POST` | `/api/applications/board/bulk-status` | `200` `{ moved: Application[], skipped: { id, code, message }[] }` |

### `POST /board/reorder`

Body:

```json
{
  "status": "APPLIED",
  "priority": "HIGH",
  "orderedIds": ["cuid1", "cuid2", "cuid3"]
}
```

Rules:

- Caller owns every id; each application must currently be in that `(status, priority)` cell—else `400 VALIDATION_ERROR` or `404` for foreign/missing.
- Atomically set `boardOrder` to index in `orderedIds`.
- Empty `orderedIds` → `400`.

### `POST /board/bulk-status`

Body:

```json
{
  "ids": ["cuid1", "cuid2"],
  "toStatus": "SCREENING"
}
```

Rules:

- Process each id independently in a transaction **per id** or one transaction with partial success recorded (prefer **per-id** attempts so one failure doesn’t roll back others).
- Not found / not owned → skip with code `NOT_FOUND` (no existence leak beyond skip).
- `assertTransition` fail → skip `INVALID_STATUS_TRANSITION`.
- Success → same as status PATCH (activity + boardOrder append in target cell).
- Response always `200` with `moved` / `skipped` arrays (not multi-status HTTP).

### List / board load

- FE: `GET /api/applications?pageSize=50&sort=updatedAt&order=desc` (or `boardOrder` if added to sort enum).
- Client groups by `status` × `priority`, sorts each cell by `boardOrder` asc.
- If `total > pageSize`: show truncation banner + link to Applications list.

**Open pin for plan:** Either raise list `pageSize` max to **100** for board, or keep 50 and document. Prefer **raise max to 100** in Phase 3 schemas only.

## Frontend

| Route | Purpose |
| --- | --- |
| `/board` | Kanban board |
| Existing `/applications*` | Unchanged primary CRUD |

- AppNav: Dashboard · Applications · Board.
- Card primary click → detail; drag handle / drag does not navigate.
- Multi-select: Cmd/Ctrl-click toggle; Escape clears; announce selection count.
- Shift-range select: optional stretch—**out of v1** unless cheap.
- Library: `@dnd-kit`.
- Mirror: `apps/web/src/lib/status-transitions.ts` with `canTransition` matching API matrix (unit-test parity cases).

## Testing

### API

- Backfill / `boardOrder` on create defaults.
- Reorder happy path + reject foreign cell ids + ownership.
- Bulk-status mixed legal/illegal → correct `moved` / `skipped`; activities only for moved.
- Status PATCH appends `boardOrder` in target cell.
- Priority change appends in new lane cell.
- Phase 2 transition + CRUD regress green.

### FE / a11y

- Manual checklist in README (keyboard move/reorder, live region, reduced motion).
- Unit tests for `canTransition` matrix parity with API cases.
- Light component tests only if low-cost; no heavy E2E required in Phase 3.

### Gate

`npm run lint && npm run typecheck && npm run test && npm run build`

## Success criteria

1. `/board` supports status drag, within-cell reorder, priority-lane move, multi bulk-status.
2. Server enforces transitions + ownership; FE `canTransition` matches matrix.
3. A11y/UX acceptance list above met.
4. README + `docs/PROJECT_CONTEXT.md` updated for Phase 3.
5. Non-goals respected.

## Non-goals (Phase 3)

Interviews, reminders/BullMQ/Redis app usage, dashboard analytics, file uploads, customizable columns, within-cell multi-card reorder, dedicated `GET /board` payload (unless plan discovers hard need), shared monorepo package for transitions.

## Spec self-review

| Check | Result |
| --- | --- |
| Placeholders | None intentional; pageSize max pinned as plan open with preference 100 |
| Cross-lane vs transition | Priority change not transition-gated—explicit |
| Bulk partial success | `200` + skipped array—explicit |
| Reorder activities | None—explicit |
| A11y deferred? | No—gate items listed |
| Conflicts with Phase 2 | Additive `boardOrder` + two POSTs; PATCH rules extended |

## Residual thin (OK for plan)

- Exact Tailwind tokens / motion durations
- Whether reorder response returns full cell applications or `{ ok: true }`
- Shift-click range select
- Toast component vs aria-live only

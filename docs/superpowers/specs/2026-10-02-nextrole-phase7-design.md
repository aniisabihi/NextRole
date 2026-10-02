# NextRole — Phase 7 Design (Frontend polish + board redesign)

**Date:** 2026-10-02  
**Status:** Approved — plan at `docs/superpowers/plans/2026-10-02-nextrole-phase7.md`  
**Path:** `~/Git/Me/NextRole`  
**Depends on:** Soft Chromatic UI (PR #5); Phases 1–6 on `main`

## Goal

Ship a **FE-first polish phase**: Soft Chromatic **medium** visual consistency + **WCAG 2.2 AA** on UI we touch (with explicit board DnD exemptions below), plus a **full Soft Chromatic board redesign** (visual + UX).

Work order: **foundations → reminder parked debt → board redesign → other screens**.

Stop before file uploads, `__Host-` cookies, session management UI, email verify, dark mode, Soft Chromatic token redesign, DnD library/model rewrite, new `/api/.../board/*` routes, or reminder/worker backend changes.

## Decisions (locked)

| Topic            | Choice                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Scope            | A11y + visual Soft Chromatic polish **+ board redesign (visual + UX filters/collapse)**                     |
| Surfaces         | Full app: auth, dashboard, applications list/new/detail, **board (major)**, reminders, AppShell/nav         |
| Visual depth     | Medium elsewhere; **board = full Soft Chromatic redesign**                                                  |
| Board structure  | Keep **status columns × priority lanes** (`groupForBoard`)                                                  |
| Board filters    | Priority multi-select **AND** “has upcoming interview” toggle; client-only on loaded page; **not persisted** |
| Board collapse   | Collapsible **status columns**; persist in `localStorage`; default all expanded                             |
| Board DnD        | Keep `@dnd-kit` + reorder/bulk-status APIs; **no DnD model rewrite**                                        |
| Filter × DnD     | **Disable card reorder while any filter is active**; column bulk-status drops still allowed                 |
| A11y bar         | WCAG 2.2 AA on touched UI **except** board exemptions in §A11y exemptions                                   |
| API              | **One exception:** always include `nextInterviewAt` on `GET /api/applications` list items                   |
| Motion           | Keep Soft Chromatic motion; honor `prefers-reduced-motion`                                                  |
| Viewport         | Support **≥360px** width (horizontal scroll OK on board); laptop 1280×720 is primary QA target              |
| Touch multi-select | **Non-goal** this phase (Cmd/Ctrl-click remains desktop-only)                                             |
| Tests / docs     | Web (+api list) Vitest green; Phase 7 row **added** to `PROJECT_CONTEXT` + README note                      |

## A11y exemptions (board)

Recorded as known debt, not Phase 7 blockers:

| Criterion                         | Ruling                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| **2.5.7 Dragging Movements**      | Exempt: existing **keyboard DnD** is the non-drag alternative; no new “Move to…” control        |
| **2.5.8 Target Size** (drag handle) | Keep current ≥44px handle; no redesign of handle size beyond Soft Chromatic chrome            |
| Touch multi-select                | Exempt / non-goal                                                                               |

All other touched controls (filters, collapse, forms, modal, bell) must meet AA (contrast 4.5:1 text / 3:1 UI components; visible focus; names/states).

## Non-goals

- New board-specific HTTP routes (reorder/bulk-status stay as today)
- DnD library swap or sortable algorithm rewrite
- Reminder/worker/Prisma reminder model changes
- File uploads, `__Host-` cookies, session UI, email verify, dark mode
- Full third-party automated a11y audit as merge gate
- Touch multi-select; single-pointer “Move to…” menu (see exemptions)
- Persisting board filters across reloads

## Architecture

```text
apps/web
  components/ui/          ← foundations (Field, Button, Modal, Empty, InlineError, …)
  components/reminders/   ← parked a11y debt
  components/board/       ← redesigned column/card/toolbar/filters/collapse
  pages/BoardPage.tsx     ← same DnD wiring; filter disables reorder
  lib/boardFilter.ts      ← pure filter helpers (unit tested)
  lib/boardCollapse.ts    ← localStorage collapse helpers (unit tested)
apps/api
  listApplications        ← always attach nextInterviewAt (batch query, no N+1)
```

## Workstreams

### 1. Shared foundations

Files: `Field`, `Button`, `Modal`, `Surface`, `PageHeader`, `StatusChip` as needed; `index.css`.

| Pattern       | Requirement                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| Focus         | Visible `:focus-visible` ring on interactive controls                       |
| Field         | Label association; `aria-invalid` + `aria-describedby` for error/help       |
| Button        | Unified default / disabled / loading / focus                                |
| Modal         | Focus trap (native dialog); **Esc closes**; **backdrop click does not**; no drag-to-dismiss |
| Inline error  | Shared pattern with `role="alert"`                                          |
| Empty/loading | Shared empty + loading for lists/sections                                   |
| Contrast      | Fix AA failures on muted ink / chips **where touched**                      |

### 2. Reminder parked debt

| Item                  | Locked behavior                                                                 |
| --------------------- | ------------------------------------------------------------------------------- |
| Bell dismiss error    | Show inline/alert error; item remains; retry via dismiss again                  |
| Focus after dismiss   | Focus next due item dismiss control if any; else bell button                    |
| Due count live region | Update polite live text when due count changes (reuse one board/app pattern)  |
| Modal dismiss         | Esc + explicit close only; **backdrop click does not close**                    |
| Shared errors         | Foundation inline error in RemindersSection + ReminderPrefsModal                |
| Delete MANUAL         | Confirm dialog before DELETE                                                    |
| Past / non-future due | **Title/body** editable only when `status===SCHEDULED`; **dueAt** only if new value is in the future (API already enforces); DUE/DISMISSED/CANCELLED: no edit form — dismiss/delete only |

### 3. Board redesign (major)

**Keep:** `APPLICATION_STATUSES` columns, `BOARD_PRIORITY_LANES`, `@dnd-kit`, `POST /board/reorder`, `POST /board/bulk-status`, keyboard sensor path, `data-drag-handle` contract.

#### 3.1 Visual / layout

- Soft Chromatic column header (status label + **visible count of currently shown cards**), empty states, card chrome
- Card content: company, title, priority chip, **next interview hint** when upcoming (format via existing `interview-datetime` helpers; absolute local display OK)
- Primary QA layout **1280×720**: `PageHeader` + filter toolbar + selection hint (existing) + column strip; no extra marketing blocks
- ≥360px: horizontal scroll for columns; collapse used for density

#### 3.2 Filters (client-only)

- Apply to **loaded** board payload only (`pageSize=100`, sort `updatedAt desc` as today). **Do not refetch** on filter change.
- Keep existing “Showing N of M” truncation banner when `total > items.length`; filters report **shown among loaded**.
- Controls:
  - Priority: `role="group"` of toggle buttons with `aria-pressed` (LOW/MEDIUM/HIGH). **None pressed = all priorities** (helper text: “All priorities”). Reset clears presses.
  - Upcoming interview: single toggle (`aria-pressed`). Off = no interview constraint.
- Combine with **AND**.
- Upcoming predicate (client): `nextInterviewAt != null && Date.parse(nextInterviewAt) >= Date.now()` (injectable `now` in helper for tests).
- Live region: reuse BoardPage’s existing `role="status"` polite region for “Showing K applications” after filter changes (debounce ~150ms). **Do not add a second live region.**

#### 3.3 Filter × DnD × selection (critical)

| Situation                         | Behavior                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| Any filter active                 | **Card-to-card / in-cell reorder disabled** (no `POST /board/reorder`). Pointer/keyboard may still **bulk-status** onto a column droppable. Announce if user tries reorder. |
| No filter                         | Reorder + bulk-status as today                                           |
| Filter changes                    | **Deselect** any selected ids not in the visible filtered set; update selection count UI |
| Escape / clear selection          | Unchanged                                                                |
| Render vs data                    | `groupForBoard` always on **full loaded items**; filters only affect **which cards mount** in cells |

Rationale: reorder API requires full-cell `orderedIds`; filtered visible lists would 400.

#### 3.4 Collapse × DnD

- Collapsed column: **header + column droppable stay mounted**; cell/`SortableContext` content unmounted.
- Pointer: dropping on collapsed column = **bulk-status / column drop** (same as today column target); auto-**expand** that column after successful drop.
- Keyboard DnD: **skip collapsed columns** in collision targets; announcement “column collapsed”. User expands then moves.
- Focus: if focused card’s column collapses, move focus to that column’s collapse control.
- Collapse control: `<button aria-expanded aria-controls={panelId}>` in column header; panel id on cell stack wrapper.

#### 3.5 Empty states

| Case                         | UI                                                              |
| ---------------------------- | --------------------------------------------------------------- |
| Zero applications total      | Board-level empty + CTA “New application”                       |
| Loaded but all filtered out  | Board-level “No matches” + **Clear filters**                    |
| Cell empty (no apps)         | “No applications” (today)                                       |
| Cell empty (filtered)        | “No matching applications”                                      |
| Collapsed zero-count column  | Header shows (0); body hidden                                   |
| Loading                      | Foundation loading pattern                                      |

#### 3.6 `nextInterviewAt` API exception

- **Always** present on each item from `GET /api/applications` (never omit).
- Value: earliest interview where `status === SCHEDULED` AND `scheduledAt >= now`, else `null`.
- `now` = **server clock once per request**; output **UTC ISO 8601** via `toISOString()` (same upcoming rule as dashboard `interviews.upcoming`).
- Excludes COMPLETED, CANCELLED, NO_SHOW, and overdue SCHEDULED (`scheduledAt < now`).
- Scope by `userId` via application ownership (no cross-user leak).
- Implementation: **one batch query** for the page’s application ids (no N+1). Existing `@@index([applicationId, scheduledAt])` OK.
- Types: web `Application` gains `nextInterviewAt: string | null`. Single-application `GET/PATCH/POST` responses **also** include the field (same mapper) so shared type stays honest.
- Sort/filter query params unchanged. Update list tests that assert exact shapes.

#### 3.7 Drag handle contract (stable)

- Keep `data-drag-handle={app.id}` and handle `aria-label` shape `Drag {company}, {title}` (+ selected suffix). Interview hint is **visual only**, not in handle name / announcements identity key.

#### 3.8 Collapse persistence

- Key: `nextrole.board.collapsed.v1`
- Value: JSON array of `ApplicationStatus` strings that are collapsed
- Default: `[]` (all expanded)
- `try/catch` on read/write; invalid → treat as default
- Validate members ⊆ `APPLICATION_STATUSES`
- Per-browser (not per-user account)
- **Unit tests mandatory**

### 4. Screen pass (non-board)

Routes matrix:

| Route                         | In pass |
| ----------------------------- | ------- |
| `/login`, `/register`         | yes     |
| `/dashboard`                  | yes     |
| `/applications`, `/applications/new` | yes |
| `/applications/:id`           | yes     |
| AppShell / nav / bell chrome  | yes (with foundations + reminder debt) |
| `/board`                      | **workstream 3 only** |

Per non-board screen: Soft Chromatic spacing; foundation empty/loading/error; sensible headings; keyboard primary actions; no contrast regressions.

### 5. Motion

- Existing motion kept; new board motion respects `useReducedMotion` / `prefers-reduced-motion: reduce`.

## Acceptance

- [ ] Foundations table met; Modal backdrop does not dismiss
- [ ] Reminder debt table met (incl. SCHEDULED-only edit rules)
- [ ] Board Soft Chromatic columns/cards; collapse persistence across reload
- [ ] Filters: priority AND upcoming; clear filters; truncation banner still correct
- [ ] **Reorder disabled when filtered**; bulk-status still works; selection pruned on filter change
- [ ] Collapse × pointer drop expands; keyboard skips collapsed with announcement
- [ ] Empty states for zero apps / no matches / cell empty vs filtered
- [ ] `nextInterviewAt` always on list (+ single) payloads; batch query; edge cases tested (null, earliest of many, overdue excluded, other user isolated)
- [ ] DnD smoke unfiltered; keyboard DnD smoke; reduced-motion on new board motion
- [ ] Contrast spot-check (4.5:1 / 3:1) on touched muted text + new board chrome
- [ ] Manual a11y: keyboard path auth → dashboard → detail (modal/bell) → board filters/collapse; **VoiceOver+Safari or NVDA+Firefox** spot-check noted in PR description
- [ ] `npm run test -w apps/api` and `apps/web` green; lint/typecheck/build green
- [ ] **Add** Phase 7 roadmap row in `PROJECT_CONTEXT`; README Phase 7 note; Later bucket unchanged

## Risks / rulings

| Risk                        | Ruling                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| Filter breaks reorder API   | **Disable reorder while filtered**                                     |
| Collapse removes droppables | Column droppable stays; cells unmount                                  |
| Interview filter needs data | Always-on `nextInterviewAt` via batch query                            |
| WCAG 2.5.7 vs keep DnD      | **Exempt**; keyboard DnD is alternative                                |
| AA vs pastel brand          | Darker ink / stronger borders, keep pastels                            |
| Scope creep                 | No uploads / session / email / new board routes / DnD rewrite          |

## Doc updates (end of phase)

- **Add** roadmap row: **7 — Frontend polish + board redesign** → Done on `main` (PR N)
- Later bucket unchanged: file uploads, `__Host-` cookies, session UI, email verify, richer contacts

## Open questions

None — all review findings closed with rulings above (2026-10-02).

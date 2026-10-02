# NextRole Phase 7 Frontend Polish + Board Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FE polish (foundations, reminder a11y debt, non-board screens) plus Soft Chromatic board redesign (collapse, filters, richer cards) with always-on `nextInterviewAt` enrichment — per Phase 7 design.

**Architecture:** Shared UI foundations first. Reminder components consume them. Board keeps `@dnd-kit` + reorder/bulk-status; **reorder disabled while filters active**; single-card status/priority `update` and column bulk-status remain allowed; collapse keeps column droppable. API attaches `nextInterviewAt` via a batch helper called from **routes** (not inside `getApplication` ownership checks).

**Tech Stack:** Existing Vite/React/TanStack/Tailwind Soft Chromatic; Vitest; Prisma read enrichment only (no migration).

**Spec:** `docs/superpowers/specs/2026-10-02-nextrole-phase7-design.md` (binding). Spec wins on conflict.

## Task order / deps

```text
Task 1 (API nextInterviewAt)
Task 2 (UI foundations)          ← parallel with Task 1 OK
Task 3 (reminders)               ← needs Task 2
Task 4 (board helpers)           ← needs Task 1 types (web Application)
Task 5a filters+guard            ← needs Task 2,4
Task 5b collapse                 ← needs Task 4,5a
Task 5c cards+empty              ← needs Task 2,5a
Task 6 (screen pass)             ← needs Task 2
Task 7 (docs+gate)               ← needs all
```

## Subagent notes

- Workdir: isolated worktree; branch `feat/phase-7-fe-polish` from `origin/main`
- Bootstrap:

```bash
cp /Users/aniisabihi/Git/Me/NextRole/apps/api/.env apps/api/.env   # if missing
npm ci
npm exec -w apps/api -- prisma generate
# Postgres must be reachable (same DATABASE_URL as local main)
```

- Patterns: Soft Chromatic tokens; `useReducedMotion`; board `BOARD_KEY` / `groupForBoard` / `boardDnd`
- Never commit `.env`
- **No** DnD library swap; **no** new board HTTP routes; **no** reminder worker changes
- Gate: `lint` + `typecheck` + `test` + `test -w apps/web` + `build` (API tests need DB up)

## Global Constraints

- WCAG 2.2 AA on touched UI except board **2.5.7 / touch multi-select** exemptions in spec
- Filters active ⇒ block **`DropAction` type `"reorder"` only**; allow `"update"` (PATCH) and multi `"bulk"` column drops
- Collapse: column droppable stays mounted; cells unmount; keyboard cannot target collapsed cell sortables (implicit skip); live message only if a skip is detectable — otherwise document unreachable
- `nextInterviewAt`: always on list + single + create + patch + **bulk `moved[]`**; UTC ISO or `null`; batch helper; dashboard upcoming semantics
- Modal: Esc + close button only — **delete backdrop `onClick` dismiss**
- Reminder edit: title/body only when `SCHEDULED` (already mostly true); dueAt future-only
- Drag handle contract unchanged: `data-drag-handle={id}`, label `Drag {company}, {title}` (+ selected suffix)

---

## File map

```text
apps/api/src/modules/applications/
  next-interview.ts          # NEW attachNextInterviewAt(ids, now)
  applications.service.ts    # unchanged getApplication; list returns raw then route enriches
  routes.ts                  # enrich GET list, GET id, POST, PATCH, bulk moved[]
apps/api/tests/applications/
  applications.list.test.ts
  applications.crud.test.ts
  applications.board.test.ts # moved[] shape if asserted
apps/web/src/lib/types.ts
apps/web/src/lib/board.test.ts
apps/web/src/lib/boardDnd.ts (+test)   # guardFilteredBoardAction
apps/web/src/lib/boardDnd.test.ts
apps/web/src/lib/boardFilter.ts (+test)
apps/web/src/lib/boardCollapse.ts (+test)
apps/web/src/lib/interview-hint.ts (+test)  # formatInterviewHint → reuse formatReminderDue
apps/web/src/components/ui/
  Field.tsx, Button.tsx, Modal.tsx
  InlineError.tsx, EmptyState.tsx, LoadingBlock.tsx
apps/web/src/index.css
apps/web/src/components/reminders/*
apps/web/src/components/board/
  BoardPage wiring in pages/BoardPage.tsx
  BoardColumn.tsx, BoardCell.tsx, BoardCard.tsx
  BoardToolbar.tsx           # NEW — filters + clear
apps/web/src/pages/*
apps/web/src/components/AppShell.tsx
README.md
docs/PROJECT_CONTEXT.md
```

---

### Task 1: `nextInterviewAt` API enrichment

**Files:**
- Create: `apps/api/src/modules/applications/next-interview.ts`
- Modify: `apps/api/src/modules/applications/routes.ts`
- Modify: `apps/api/tests/applications/applications.list.test.ts`
- Modify: `apps/api/tests/applications/applications.crud.test.ts`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/board.test.ts`, `apps/web/src/lib/boardDnd.test.ts` (fixture `nextInterviewAt: null`)

**Interfaces:**
- Consumes: none
- Produces:

```ts
// next-interview.ts
export async function attachNextInterviewAt<T extends { id: string }>(
  apps: T[],
  now?: Date,
): Promise<Array<T & { nextInterviewAt: string | null }>>;
```

- [ ] **Step 1: Failing tests** (prisma seed interviews; do not rely on HTTP interview create for past dates)

```ts
// applications.list.test.ts
it("nextInterviewAt null when no interviews", async () => { /* create app; list; expect null */ });
it("nextInterviewAt earliest future SCHEDULED", async () => {
  // prisma.interview.create two SCHEDULED future dates; expect min ISO
});
it("nextInterviewAt null for past SCHEDULED / CANCELLED / COMPLETED / NO_SHOW", async () => { /* … */ });
it("does not leak other user's interviews", async () => { /* other user interview on their app; our list null */ });

// applications.crud.test.ts
it("GET /:id includes nextInterviewAt", async () => { /* … */ });
it("POST / returns nextInterviewAt null", async () => { /* … */ });
it("PATCH /:id includes nextInterviewAt", async () => { /* … */ });
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -w apps/api -- applications.list applications.crud
```

Expected: FAIL (missing field / helper)

- [ ] **Step 3: Implement helper** (batch `findMany`, first per `applicationId`, `toISOString()`, one `now`)

- [ ] **Step 4: Call from routes only** — after service returns for `GET /`, `GET /:id`, `POST /`, `PATCH /:id`. For `POST /board/bulk-status`, run `attachNextInterviewAt(moved)` before reply. **Do not** call from `getApplication` used as ownership check.

- [ ] **Step 5: Tests PASS**

```bash
npm run test -w apps/api -- applications.list applications.crud applications.board
```

Expected: PASS

- [ ] **Step 6: Web type + fixtures**

```ts
export type Application = { /* existing */ nextInterviewAt: string | null };
```

Update every `app()` fixture in `board.test.ts` / `boardDnd.test.ts`.

```bash
npm run typecheck -w apps/web
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/applications/next-interview.ts \
  apps/api/src/modules/applications/routes.ts \
  apps/api/tests/applications/applications.list.test.ts \
  apps/api/tests/applications/applications.crud.test.ts \
  apps/web/src/lib/types.ts apps/web/src/lib/board.test.ts \
  apps/web/src/lib/boardDnd.test.ts
git commit -m "feat(api): attach nextInterviewAt on application payloads"
```

---

### Task 2: UI foundations

**Files:**
- Modify: `Modal.tsx`, `Field.tsx`, `Button.tsx`, `index.css`
- Create: `InlineError.tsx`, `EmptyState.tsx`, `LoadingBlock.tsx`

**Interfaces:**
- Consumes: none
- Produces:

```tsx
export function InlineError({ children }: { children: ReactNode }): JSX.Element;
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element;
export function LoadingBlock({ label?: string }): JSX.Element; // default "Loading…"
export function Button({ loading?: boolean, /* existing */ }): JSX.Element;
// Field: error sibling OUTSIDE <label>; control gets id + aria-invalid + aria-describedby via cloneElement(single child)
```

- [ ] **Step 1: Modal** — remove `<dialog onClick={… backdrop}>` handler; update comment to “Esc and close button dismiss; backdrop does not”. Manual verify in Task 7.

- [ ] **Step 2: Field** — restructure so label wraps only the label text + control; **error `<p id>` is a sibling** under a fragment/div wrapper (not inside `<label>`). Use `useId` + `cloneElement` on the single child to set `id`, `aria-invalid`, `aria-describedby`. Keep `hint?: string`. Existing call sites keep working when `error` omitted.

- [ ] **Step 3: InlineError / EmptyState / LoadingBlock** as above (`role="alert"` / `role="status"`).

- [ ] **Step 4: Button** — add optional `loading?: boolean` → `disabled={disabled || loading}`, `aria-busy={loading || undefined}`, preserve focus styles.

- [ ] **Step 5: Contrast** — set `--color-ink-muted` and `--color-ink-faint` so body text on `--color-paper` / `--color-surface` meets **4.5:1**; chip/border UI **3:1**. Verify with browser DevTools contrast or `npx color-contrast-checker` equivalent; record values in commit body if changed.

- [ ] **Step 6: Run web tests**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui apps/web/src/index.css
git commit -m "feat(web): Soft Chromatic UI foundations for a11y polish"
```

---

### Task 3: Reminder parked debt

**Files:**
- Modify: `ReminderBell.tsx`, `RemindersSection.tsx`, `ReminderPrefsModal.tsx`

**Interfaces:**
- Consumes: `InlineError` (Task 2); Modal backdrop fix (Task 2)
- Produces: bell dismiss error UI; live due-count; confirm delete; SCHEDULED-only edit verified

- [ ] **Step 1: Bell load + dismiss errors** — replace ad-hoc error `<p>` (load failure) with `InlineError`. Add `onError` on dismiss mutation → `InlineError` in dropdown; item stays.

- [ ] **Step 2: Focus after successful dismiss** — after refetch, focus dismiss control of next remaining **due** row if any; else `buttonRef.current?.focus()` (bell toggle). Do **not** invent `#reminder-bell` id.

- [ ] **Step 3: Due-count live region** — always-mounted visually hidden `aria-live="polite"` inside bell root. Update text only when due count **changes** after first paint (skip initial mount). Example: `2 reminders due`. Keep existing button `aria-label`; live region is additive.

- [ ] **Step 4: Section + prefs** — load/mutation errors → `InlineError`. Delete MANUAL: `window.confirm("Delete this reminder? This cannot be undone.")` (same pattern as InterviewsSection); skip if `remove.isPending`.

- [ ] **Step 5: Edit rules audit** — confirm `canEdit = kind===MANUAL && status===SCHEDULED` already; ensure DUE has no edit form. No churn if already correct; add comment pointing at API future-dueAt rule.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/reminders
git commit -m "fix(web): reminder bell a11y, errors, and delete confirm"
```

---

### Task 4: Board filter + collapse helpers

**Files:**
- Create: `boardFilter.ts`, `boardFilter.test.ts`, `boardCollapse.ts`, `boardCollapse.test.ts`

**Interfaces:**
- Consumes: `Application`, `Priority`, `ApplicationStatus` from Task 1 types
- Produces: signatures below

```ts
export type BoardFilters = {
  priorities: Priority[]; // empty = all
  upcomingInterviewOnly: boolean;
};
export function hasActiveBoardFilters(f: BoardFilters): boolean;
export function applicationMatchesBoardFilters(
  app: Application,
  filters: BoardFilters,
  nowMs?: number,
): boolean;
export function filterApplicationsForBoard(
  items: Application[],
  filters: BoardFilters,
  nowMs?: number,
): Application[];

export const BOARD_COLLAPSE_KEY = "nextrole.board.collapsed.v1";
export function readCollapsedStatuses(): Set<ApplicationStatus>;
export function writeCollapsedStatuses(collapsed: ReadonlySet<ApplicationStatus>): void;
export function toggleCollapsedStatus(
  collapsed: ReadonlySet<ApplicationStatus>,
  status: ApplicationStatus,
): Set<ApplicationStatus>;
```

Rules: AND combine; upcoming = `nextInterviewAt != null && !Number.isNaN(Date.parse(...)) && Date.parse(...) >= nowMs`; invalid date → false; `hasActiveBoardFilters` = `priorities.length > 0 || upcomingInterviewOnly`.

Collapse: key above; JSON string[]; unknown statuses dropped; non-array/invalid → `[]`; try/catch on storage.

- [ ] **Step 1: Failing tests**

```bash
npm run test -w apps/web -- boardFilter boardCollapse
```

Expected: FAIL (modules missing)

- [ ] **Step 2: Implement + PASS** same command

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/boardFilter.ts apps/web/src/lib/boardFilter.test.ts \
  apps/web/src/lib/boardCollapse.ts apps/web/src/lib/boardCollapse.test.ts
git commit -m "feat(web): board filter and collapse helpers"
```

---

### Task 5a: Board filters + filtered DnD guard

**Files:**
- Create: `BoardToolbar.tsx`
- Modify: `BoardPage.tsx`, `boardDnd.ts`, `boardDnd.test.ts`
- Modify: `BoardColumn.tsx` / `BoardCell.tsx` (accept visible items / counts)

**Interfaces:**
- Consumes: Task 2 Empty/Loading/InlineError; Task 4 filters; Task 1 `nextInterviewAt`
- Produces:

```ts
export function guardFilteredBoardAction(
  action: DropAction | MultiDropAction,
  filtersActive: boolean,
): "allow" | "block-reorder";
// block only when filtersActive && action.type === "reorder"
```

- [ ] **Step 1: Unit-test guard** (allow update/bulk when filtered; block reorder)

```bash
npm run test -w apps/web -- boardDnd
```

- [ ] **Step 2: Toolbar** — priority `aria-pressed` toggles + upcoming toggle + Clear; helper text “All priorities” when none pressed; filters not persisted

- [ ] **Step 3: BoardPage state** — `filters`; `allItems` from query; `visibleItems = filterApplicationsForBoard(...)`; `fullCells = groupForBoard(allItems)`; `visibleCells = groupForBoard(visibleItems)`. Pass `visibleCells` into columns for render/`SortableContext`. Use `fullCells` only inside `resolveDrop` / multi when **unfiltered**; when filtered, never call reorder path.

- [ ] **Step 4: Selection prune** — effect: selected ⊆ ids present in **visible** cells (and not in collapsed statuses once Task 5b lands — for 5a prune on filter only).

- [ ] **Step 5: Live region** — debounce 150ms; set existing polite region to `Showing ${visibleCount} applications` (loaded subset). Keep truncation banner “Showing N of M” for `total > items.length` independently.

- [ ] **Step 6: Replace board loading/error** — `LoadingBlock` / `InlineError`

- [ ] **Step 7: Tests + commit**

```bash
npm run test -w apps/web -- boardDnd boardFilter
git add apps/web/src/pages/BoardPage.tsx apps/web/src/components/board \
  apps/web/src/lib/boardDnd.ts apps/web/src/lib/boardDnd.test.ts
git commit -m "feat(web): board filters and disable reorder while filtered"
```

---

### Task 5b: Board column collapse

**Files:**
- Modify: `BoardColumn.tsx`, `BoardPage.tsx`

**Interfaces:**
- Consumes: Task 4 collapse helpers; Task 5a board state
- Produces: collapse UI + persistence + drop-on-collapsed expand

- [ ] **Step 1: Collapse button** in header — `aria-expanded={!collapsed}`; when expanded, `aria-controls={panelId}` pointing at **always-mounted** wrapper (`hidden={collapsed}` or `inert`) around cells so id never dangles.

- [ ] **Step 2: Persist** via `readCollapsedStatuses` / `writeCollapsedStatuses` on toggle.

- [ ] **Step 3: DnD** — column `useDroppable` always registered. On successful **column** drop / bulk onto collapsed status → expand that status then persist. On failed drop → leave collapsed.

- [ ] **Step 4: Selection × collapse** — prune selection that lives only in collapsed columns (same effect as filter prune).

- [ ] **Step 5: Keyboard** — document: keyboard path cannot drop on column ids today; collapsed cells unmounted ⇒ skip is implicit. **No new announcer required** this phase (ruling).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/board/BoardColumn.tsx apps/web/src/pages/BoardPage.tsx
git commit -m "feat(web): collapsible board columns with persistence"
```

---

### Task 5c: Board cards + empty states + hint formatter

**Files:**
- Create: `interview-hint.ts`, `interview-hint.test.ts` (`formatInterviewHint` re-exports or wraps `formatReminderDue`)
- Modify: `BoardCard.tsx`, `BoardCell.tsx`, `BoardPage.tsx`

**Interfaces:**
- Consumes: Task 2 EmptyState; `nextInterviewAt`
- Produces: redesigned card chrome; empty-state matrix

- [ ] **Step 1: `formatInterviewHint(iso)`** — unit test; handle NaN

- [ ] **Step 2: Card Soft Chromatic redesign** — company, title, priority, optional hint. **Assert** drag handle `aria-label` still `Drag ${company}, ${title}` without interview text (unit or snapshot of label builder).

- [ ] **Step 3: Empty matrix**
  - Zero apps → `EmptyState` + Link CTA New application
  - All filtered out → `EmptyState` “No matches” + Clear filters button
  - Cell empty unfiltered → “No applications”
  - Cell empty filtered → “No matching applications” (`filtered` prop)
  - Collapsed (0) → header count only
  - Loading → already LoadingBlock in 5a

- [ ] **Step 4: Column header count** = visible cards in that status (from `visibleCells`)

- [ ] **Step 5: reduced-motion** — any new transition uses `useReducedMotion` / CSS `prefers-reduced-motion`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/interview-hint.ts apps/web/src/lib/interview-hint.test.ts \
  apps/web/src/components/board apps/web/src/pages/BoardPage.tsx
git commit -m "feat(web): Soft Chromatic board cards and empty states"
```

---

### Task 6: Non-board screen pass

**Files:** Login, Register, Dashboard, Applications, ApplicationNew, ApplicationDetail, AppShell

**Interfaces:**
- Consumes: Task 2 foundations
- Produces: each route uses InlineError/Empty/Loading; Field error sibling where forms show server errors

**Per-route checklist (do all):**

| Route | Actions |
| ----- | ------- |
| `/login` | InlineError; Field error props on email/password if validation shown |
| `/register` | same |
| `/dashboard` | loading/empty foundations; heading hierarchy |
| `/applications` | list empty/loading/error foundations |
| `/applications/new` | Field errors + InlineError |
| `/applications/:id` | section errors via InlineError; no board work |
| AppShell/nav | focus rings; no contrast regression |

Migrate **all** `Field`+control call sites to the new Field wrapper (count ~26 — mechanical).

- [ ] **Step 1: Auth pages** + commit `fix(web): polish auth forms a11y`
- [ ] **Step 2: Dashboard + applications list/new** + commit `fix(web): polish dashboard and application list`
- [ ] **Step 3: Detail + AppShell** + commit `fix(web): polish application detail and shell`

After each commit:

```bash
npm run test -w apps/web && npm run typecheck -w apps/web
```

Expected: PASS

---

### Task 7: Docs + gate + manual smoke

**Files:** `docs/PROJECT_CONTEXT.md`, `README.md`

**Interfaces:**
- Consumes: all prior tasks done
- Produces: docs + green gate

- [ ] **Step 1: Docs** — **Add** Phase 7 roadmap row: status **Done on branch `feat/phase-7-fe-polish` (PR pending)** during implementation; after merge bump to Done on `main`. Later bucket unchanged. README Phase 7: foundations, reminder a11y, board filters/collapse, `nextInterviewAt`.

- [ ] **Step 2: Full gate** (DB up)

```bash
npm run lint && npm run typecheck && npm run test && npm run test -w apps/web && npm run build
```

Expected: all PASS

- [ ] **Step 3: Manual smoke** (record in PR body)

1. Keyboard: login → dashboard → detail (open prefs modal; Esc closes; backdrop click does **not**) → bell dismiss focus
2. Board unfiltered: reorder + bulk-status
3. Board filtered: reorder blocked (live message); PATCH move / bulk column still works; Clear filters
4. Collapse: persist reload; drop on collapsed column expands on success
5. Viewport ~360px horizontal scroll OK
6. `prefers-reduced-motion` — no jarring new motion
7. Contrast spot-check muted text + board chrome
8. SR: VoiceOver+Safari **or** NVDA+Firefox on bell due-count + filter toggles

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_CONTEXT.md README.md
git commit -m "docs: add Phase 7 frontend polish and board redesign notes"
```

---

## Spec coverage (requirement → task)

| Requirement | Task |
| ----------- | ---- |
| `nextInterviewAt` always list+single+POST+PATCH | 1 |
| `nextInterviewAt` on bulk `moved[]` | 1 |
| Batch query / isolation / overdue excluded | 1 |
| Modal no backdrop dismiss | 2 |
| Field aria-invalid/describedby | 2 |
| Button loading | 2 |
| InlineError / Empty / Loading | 2 |
| Contrast tokens | 2 |
| Bell dismiss error + focus + live count | 3 |
| Delete confirm; prefs/section errors | 3 |
| SCHEDULED-only edit | 3 |
| Filter helpers + hasActiveBoardFilters | 4 |
| Collapse localStorage contract | 4 |
| Toolbar filters + debounce live region | 5a |
| Truncation banner + shown-among-loaded | 5a |
| Reorder blocked when filtered; update/bulk allowed | 5a |
| visibleCells vs fullCells | 5a |
| Collapse UI + expand on successful column drop | 5b |
| Selection prune filter+collapse | 5a/5b |
| Cards + interview hint formatter | 5c |
| Empty-state matrix §3.5 | 5c |
| Reduced motion on board | 5c |
| Non-board route matrix | 6 |
| Docs + gate + manual a11y smoke | 7 |
| 2.5.7 exemption / no DnD rewrite | Global |

## Placeholder scan

Removed: Pseudo, prefer/or/optional/as-needed hedges. Decisions locked above.

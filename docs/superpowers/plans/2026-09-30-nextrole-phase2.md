# NextRole Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-owned job applications CRUD with list/search/filter/sort, soft status transitions, activity timeline, and matching React pages — without Kanban/interviews/reminders/stats.

**Architecture:** Extend Phase 1 Fastify+Prisma+Vite with `modules/applications` (service writes `Activity` in same transaction). FE adds `/applications*` using existing `apiClient`.

**Tech Stack:** Existing monorepo — Fastify, Prisma, Zod, Vitest, React, Vite, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-30-nextrole-phase2-design.md` (binding).

## Subagent notes

- Workdir: `/Users/aniisabihi/Git/Me/NextRole`
- Branch: `feat/phase-2-applications` from latest `main`
- Patterns: `modules/auth/*`, `modules/users/routes.ts` (`authGuard`), `tests/helpers/http.ts`, `tests/helpers/db.ts`, `buildApp`
- Spec wins on conflict; document deviations
- Never commit `.env`
- No Kanban / interviews / BullMQ
- Fresh subagent: do **not** rely on “see prior draft” — required code is inlined below

## Global Constraints

- Ownership: `userId` on every query; cross-user → `404 NOT_FOUND`
- Mutations: existing CSRF + Origin hooks
- Soft status matrix via `assertTransition`
- Activities: `type` column; payloads per spec; no public activity POST
- `employmentType` ≠ `workplaceType`
- HTTP: list `200 { items, total, page, pageSize }`; create `201 { application }`; get/patch `200 { application }`; delete `204`; activities `200 { items }` (max 200)
- Validation max lengths / URL / email / dates per spec
- Priority sort: `LOW < MEDIUM < HIGH`
- Gate: lint + typecheck + test + build

---

## File map

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/**
apps/api/src/modules/applications/
  status-transitions.ts
  dates.ts
  schemas.ts
  applications.service.ts
  routes.ts
apps/api/src/app.ts
apps/api/tests/helpers/db.ts              # cascade Application/Activity
apps/api/tests/helpers/applications.ts    # registerAndLogin
apps/api/tests/applications/*.test.ts
apps/web/src/components/AppNav.tsx
apps/web/src/pages/ApplicationsPage.tsx
apps/web/src/pages/ApplicationNewPage.tsx
apps/web/src/pages/ApplicationDetailPage.tsx
apps/web/src/App.tsx
apps/web/src/pages/DashboardPage.tsx
README.md
docs/superpowers/specs/2026-09-30-nextrole-phase2-design.md  # already exists; commit if untracked
docs/superpowers/plans/2026-09-30-nextrole-phase2.md
```

---

### Task 1: Prisma schema + migration + update resetDb

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (add enums/models + `User.applications`)
- Modify: `apps/api/tests/helpers/db.ts` — delete activities/applications before users
- Create: migration `add_applications`

**Produces:** Generated Prisma client with `Application`, `Activity`, enums.

- [ ] **Step 1: Extend `schema.prisma`** with exact models from plan appendix A (below). Add `applications Application[]` on `User`.

- [ ] **Step 2: Update `resetDb`**

```ts
export async function resetDb(): Promise<void> {
  await prisma.activity.deleteMany();
  await prisma.application.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 3: Migrate**

```bash
npm run db:migrate:dev -w apps/api -- --name add_applications
```

- [ ] **Step 4: Commit** (include migration; if Phase 2 spec/plan untracked, add them too)

```bash
git commit -m "$(cat <<'EOF'
chore: add Application and Activity prisma models

EOF
)"
```

---

### Task 2: status-transitions.ts (unit TDD)

**Files:**

- Create: `apps/api/src/modules/applications/status-transitions.ts`
- Test: `apps/api/tests/applications/status-transitions.test.ts`

**Produces:**

- `assertTransition(from, to): void`
- `TERMINAL` / `PIPELINE` sets for reuse

- [ ] **Step 1: Failing tests** covering matrix:

| Case                | Expect                          |
| ------------------- | ------------------------------- |
| SAVED→APPLIED       | ok                              |
| APPLIED→OFFER       | ok                              |
| OFFER→APPLIED       | throw INVALID_STATUS_TRANSITION |
| REJECTED→WITHDRAWN  | ok                              |
| WITHDRAWN→SAVED     | ok                              |
| WITHDRAWN→SCREENING | throw                           |
| OFFER→OFFER         | no throw (no-op)                |

- [ ] **Step 2: Implement** (use this logic verbatim):

```ts
import type { ApplicationStatus } from "@prisma/client";
import { AppError } from "../../shared/errors/app-error.js";

const TERMINAL = new Set<ApplicationStatus>(["OFFER", "REJECTED", "WITHDRAWN"]);
const WITHDRAWN_REOPEN = new Set<ApplicationStatus>(["SAVED", "APPLIED"]);

export function assertTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): void {
  if (from === to) return;

  const fromTerminal = TERMINAL.has(from);
  const toTerminal = TERMINAL.has(to);

  if (!fromTerminal) return; // non-terminal → anything

  if (toTerminal) return; // terminal → terminal

  // terminal → non-terminal
  if (from === "WITHDRAWN" && WITHDRAWN_REOPEN.has(to)) return;

  throw new AppError(
    "INVALID_STATUS_TRANSITION",
    400,
    `Cannot transition from ${from} to ${to}`,
  );
}
```

- [ ] **Step 3: PASS + commit** `feat: add application status transition rules`

---

### Task 3: dates.ts + schemas.ts (TDD date parser)

**Files:**

- Create: `apps/api/src/modules/applications/dates.ts`
- Create: `apps/api/src/modules/applications/schemas.ts`
- Test: `apps/api/tests/applications/dates.test.ts`

**Produces:**

- `parseOptionalDateInput(value: string | null | undefined): Date | null | undefined`
  - `undefined` → undefined (omit)
  - `null` → null (clear)
  - `YYYY-MM-DD` → UTC midnight that day
  - otherwise `new Date(iso)`; invalid → throw / Zod fail
- Zod create/update/list schemas with max lengths from spec
- `jobUrl`: empty→optional; if set `z.string().url()` and starts with http/https
- `updateApplicationSchema`: `.refine((o) => Object.keys(o).length > 0)`

- [ ] **Step 1: Failing date tests** (`2024-01-15` → UTC midnight; full ISO; null; invalid)
- [ ] **Step 2: Implement dates + schemas**
- [ ] **Step 3: PASS + commit** `feat: add application zod schemas and date parsing`

---

### Task 4: Service + routes + first HTTP test (together)

**Why combined:** HTTP create→get needs routes; avoid Task-order trap.

**Files:**

- Create: `applications.service.ts`, `routes.ts`
- Create: `tests/helpers/applications.ts`
- Create: `tests/applications/applications.crud.test.ts` (minimal create→get first)
- Modify: `app.ts`

**Helper `registerAndLogin(app)`:**

```ts
// 1) bootstrapCsrf
// 2) POST /api/auth/register with Origin + CSRF + unique email
// 3) merge cookies; return { cookies, cookieHeader, user }
```

**Service signatures:**

```ts
createApplication(userId: string, input: CreateInput): Promise<Application>
getApplication(userId: string, id: string): Promise<Application> // 404
listApplications(userId: string, query: ListQuery): Promise<{ items; total; page; pageSize }>
updateApplication(userId: string, id: string, patch: UpdateInput): Promise<Application>
deleteApplication(userId: string, id: string): Promise<void>
listActivities(userId: string, applicationId: string): Promise<Activity[]>
```

**Priority sort SQL fragment (when sort=priority):**

```sql
ORDER BY CASE priority WHEN 'LOW' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'HIGH' THEN 3 END ASC|DESC
```

Use `prisma.$queryRaw` **or** `orderBy` with mapped field — if Prisma can't CASE easily, fetch+sort in JS only for priority sort on current page is **wrong** (breaks pagination). Prefer `$queryRaw` for list when `sort===priority`, else Prisma `findMany`+`count`.

Simpler acceptable approach: add generated column / use:

```ts
orderBy: {
  priority: order;
} // WRONG alphabetically
```

**Ruling (pinned):** For `sort=priority`, use Prisma `findMany` with raw query via `$queryRaw` joining filters, **or** use:

```ts
// Prisma 5+ unsupported CASE in orderBy — use:
orderBy: [{ priority: order }];
```

**Wait — alphabetical HIGH<LOW<MEDIUM.** Spec requires LOW<MEDIUM<HIGH.

**Pinned implementation:** use `$queryRawUnsafe` / tagged raw with bound params for list when sorting by priority; otherwise standard Prisma. Document in service comment.

**Alternative pinned (simpler, correct):** store `priorityRank Int` @default(2) maintained on write (LOW=1,MEDIUM=2,HIGH=3), index it, `orderBy: { priorityRank: order }`. Slight schema addition.

**Ruling for Phase 2 plan:** Add `priorityRank Int` to Application in Task 1 if not already — **amend Task 1**: add `priorityRank Int @default(2)` and set on create/update whenever priority changes. List sorts by `priorityRank`. Keeps Prisma-only queries.

**If Task 1 already migrated without priorityRank:** add follow-up migration in Task 4. Prefer amending Task 1 before execute starts.

- [ ] **Step 0 (controller/implementer):** Ensure schema has `priorityRank Int @default(2)` (+ set in service). If Task 1 done without it, migrate `add_priority_rank`.

- [ ] **Step 1: Write failing HTTP test** create application → get by id (CSRF+Origin+cookies)

- [ ] **Step 2: Implement service create/get + routes + register in `app.ts`**

```ts
await app.register(applicationsRoutes, { prefix: "/api/applications" });
```

Routes use `preHandler: [authGuard]`. Paths: `/`, `/:id`, `/:id/activities`.

- [ ] **Step 3: Test green; commit** `feat: implement applications service and REST routes`

---

### Task 5: Complete service (update/delete/list/activities) + full API tests

**Files:**

- Modify: `applications.service.ts` (finish methods)
- Create/expand: `applications.crud.test.ts`, `applications.list.test.ts`, `applications.activities.test.ts`

**updateApplication algorithm:**

```
1. load app by id+userId; else 404
2. build next values from patch (null clears)
3. if status changing: assertTransition(old, new); if same skip status write
4. compute fieldDiff for non-status keys
5. transaction:
   - update application (+ priorityRank if priority changed)
   - if status changed: Activity STATUS_CHANGED
   - if fieldDiff nonempty: Activity FIELDS_UPDATED
6. return updated application
```

**createApplication:** insert + Activity APPLICATION_CREATED `{ company, title, status }`; set priorityRank from priority.

- [ ] **Step 1: Write all spec integration tests** (checklist in Global/spec)
- [ ] **Step 2: Implement until green**
- [ ] **Step 3: Full `npm run test -w apps/api` PASS; commit** `test: cover applications CRUD list activities and transitions`

---

### Task 6: Frontend — nav, list, create, dashboard

**Files:**

- Create: `apps/web/src/components/AppNav.tsx`
- Create: `apps/web/src/pages/ApplicationsPage.tsx`
- Create: `apps/web/src/pages/ApplicationNewPage.tsx`
- Modify: `apps/web/src/App.tsx`, `DashboardPage.tsx`

**Produces:**

- Routes: `/applications`, `/applications/new` (detail in Task 7)
- AppNav on dashboard + applications pages
- List: TanStack Query; search input; selects for status/employment/workplace/priority; sort; pagination
- Create form → POST → `navigate(/applications/:id)`
- Dashboard: link + `pageSize=5` recent list

- [ ] **Step 1: Implement UI**
- [ ] **Step 2: Smoke** `npm run dev` — list/create work
- [ ] **Step 3: Commit** `feat: add applications list and create UI`

---

### Task 7: Frontend detail + timeline + README + gate

**Files:**

- Create: `apps/web/src/pages/ApplicationDetailPage.tsx`
- Modify: `App.tsx` (add `/:id` route — register **before** catching conflicts; path `/applications/:id`)
- Modify: `README.md`

**Produces:**

- Detail: GET application + activities; form PATCH; status dropdown; timeline rendering by type
- README Phase 2 section: endpoints, enums, transition matrix, employment vs workplace, how to run

- [ ] **Step 1: Detail + timeline**
- [ ] **Step 2: README**
- [ ] **Step 3: Gate**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

- [ ] **Step 4: Commit** `feat: add application detail timeline and Phase 2 docs`

---

## Appendix A — Prisma models (Task 1)

Include all enums + Application + Activity from earlier draft, **plus**:

```prisma
  priority           Priority          @default(MEDIUM)
  priorityRank       Int               @default(2)
```

Service mapping: `LOW→1`, `MEDIUM→2`, `HIGH→3`. Always set `priorityRank` alongside `priority` on create/update.

---

## Spec coverage

| Spec item                          | Task      |
| ---------------------------------- | --------- |
| Schema + migration + resetDb       | 1         |
| Transition matrix                  | 2         |
| Zod + dates                        | 3         |
| Service + routes + first HTTP      | 4         |
| Full API tests                     | 5         |
| FE list/create/nav                 | 6         |
| FE detail/timeline + README + gate | 7         |
| Non-goals                          | respected |

## Plan review changelog

| Issue                        | Fix                                          |
| ---------------------------- | -------------------------------------------- |
| Task 4 HTTP before routes    | Merged service+routes+first test into Task 4 |
| Priority alpha sort wrong    | Added `priorityRank` + service mapping       |
| resetDb misses Application   | Task 1 updates helper                        |
| Weak schema TDD              | Dedicated dates.test.ts                      |
| Vague “expand in later task” | Explicit Task 5 checklist                    |
| FE paths incomplete          | Full `apps/web/src/...` paths                |
| SDD placeholders             | Inlined transition impl + update algorithm   |

## Residual thin (OK)

- Exact Tailwind layout
- Whether activities helper file is separate (keep in service)

---

## Execution handoff

Plan: `docs/superpowers/plans/2026-09-30-nextrole-phase2.md`

**1. Subagent-Driven (recommended)** · **2. Inline Execution**

Which approach?

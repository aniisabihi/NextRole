# NextRole Phase 6 Reminders / BullMQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship in-app reminders (MANUAL + INTERVIEW lead-time + FOLLOW_UP) with Postgres source of truth, BullMQ delayed jobs, `apps/api` worker process, Soft Chromatic bell/detail/prefs — per Phase 6 design.

**Architecture:** `Reminder` rows + User prefs. API enqueues/cancels versioned BullMQ jobs. `processReminderJob` + `startReminderWorker`; `src/worker.ts` thin entry. Web: AppShell bell, detail section, Modal prefs.

**Tech Stack:** Existing monorepo + **`bullmq`**. Redis from Compose. Vitest; CI Redis service.

**Spec:** `docs/superpowers/specs/2026-10-01-nextrole-phase6-design.md` (binding). Spec wins on conflict.

## Subagent notes

- Workdir: isolated worktree; branch `feat/phase-6-reminders` from `origin/main`
- **Bootstrap:**

```bash
cp /Users/aniisabihi/Git/Me/NextRole/apps/api/.env apps/api/.env   # if missing
# ensure REDIS_URL=redis://127.0.0.1:6379 (optional — code defaults)
npm ci
npm exec -w apps/api -- prisma generate
docker compose up -d
```

- Patterns: `registerAndLogin`, `TEST_ORIGIN` + CSRF, `authGuard`, `AppError`, `parseBody`, `resetDb`
- **Redis in tests:** Queue `prefix: "test"` (or Redis DB `1`); `obliterate({ force: true })` in `beforeEach`; `closeReminderQueue()` in `afterAll` / Fastify `onClose`. Do **not** FLUSHDB. Prefer **real queue getJob** assertions over spies for HTTP tests (Redis required for reminder suites).
- Env: `REDIS_URL` **defaults** to `redis://127.0.0.1:6379` in `env.ts` (same pattern as other tunables) — never make it required-without-default or existing tests break
- Worker entry: `dotenv.config` like `server.ts`; extract `processReminderJob` / `startReminderWorker` for testability
- Never commit `.env`
- No email / `apps/worker` package / Bull Board
- Gate: `lint` + `typecheck` + `test` + `test -w apps/web` + `build`

## Global Constraints

- Job id: **`reminder-${id}-${dueAtMs}`** — **no colon**; store in `bullJobId`; `removeOnComplete/Fail: true`; always remove-then-add
- Queue: `enableOfflineQueue: false`; enqueue errors logged, HTTP still 2xx after DB commit; sweep repairs
- Fire/dismiss: **CAS** `updateMany` on `status=SCHEDULED` (dismiss also from `DUE`); activity only if count=1
- FOLLOW_UP stay = continuous `{APPLIED,SCREENING}`; create only on **enter from outside** (incl. createApplication); APPLIED↔SCREENING no reset
- Prefs FOLLOW_UP recompute: `dueAt = createdAt + followUpDays`
- Partial unique indexes (raw SQL) for one SCHEDULED FOLLOW_UP per app / INTERVIEW per interviewId
- Soft Chromatic; labels for kind/status; activity types on web timeline

---

## File map

```text
.env.example                                  # root — REDIS_URL (NOT apps/api/.env.example)
apps/api/package.json                         # bullmq; worker / dev:worker / start:worker
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/**/add_reminders/**  # includes partial unique SQL
apps/api/src/config/env.ts
apps/api/src/jobs/queue.ts
apps/api/src/jobs/reminder-queue.ts
apps/api/src/modules/reminders/
  reminder-schedule.ts (+ unit test)
  process-reminder-job.ts                     # CAS fire — unit testable
  schemas.ts
  reminders.service.ts
  reminder-hooks.ts
  routes.ts
apps/api/src/modules/users/                   # GET/PATCH /me/reminder-prefs
apps/api/src/modules/interviews/interviews.service.ts
apps/api/src/modules/applications/applications.service.ts
apps/api/src/worker.ts                        # thin: dotenv + startReminderWorker + reconcile loop
apps/api/src/app.ts                           # onClose close queue; register reminder routes
apps/api/tests/reminders/**
apps/api/tests/helpers/reminders.ts           # seedReminder, waitForDue, queue helpers
apps/web/src/lib/types.ts                     # Reminder* + ACTIVITY_TYPES
apps/web/src/lib/labels.ts
apps/web/src/lib/reminder-badge.ts (+test)    # 9+ cap
apps/web/src/components/ui/Modal.tsx
apps/web/src/components/reminders/
  ReminderBell.tsx
  RemindersSection.tsx
  ReminderPrefsModal.tsx
apps/web/src/components/AppShell.tsx          # bell slot beside AppNav
apps/web/src/components/AppNav.tsx
apps/web/src/pages/ApplicationDetailPage.tsx  # RemindersSection + activity branches
package.json                                  # concurrently api,web,worker
.github/workflows/ci.yml
README.md
docs/PROJECT_CONTEXT.md
```

---

### Task 1: Schema, env, queue scaffolding

**Files:** root `.env.example`, `apps/api/prisma/*`, `env.ts`, `package.json`, `src/jobs/*`

- [ ] **Step 1: Prisma** — enums, Reminder, User prefs, ActivityType; migration with **partial unique** raw SQL

- [ ] **Step 2: Env** — `REDIS_URL: z.string().default("redis://127.0.0.1:6379")`; document in **root** `.env.example`

- [ ] **Step 3: Install bullmq**; scripts:

```json
"dev:worker": "tsx watch src/worker.ts",
"worker": "tsx src/worker.ts",
"start:worker": "node dist/worker.js"
```

Stub `worker.ts` logs “worker starting” until Task 4.

- [ ] **Step 4: Queue** — prefix-aware connection; `enableOfflineQueue: false`; `enqueueReminder` / `removeReminderJob` with versioned ids + remove-then-add + removeOnComplete/Fail

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/api/prisma apps/api/src/jobs apps/api/src/config/env.ts apps/api/package.json apps/api/src/worker.ts package-lock.json
git commit -m "feat(api): add Reminder schema and BullMQ queue scaffolding"
```

---

### Task 2: Pure schedule helpers (TDD)

**Files:** `reminder-schedule.ts`, `tests/reminders/reminder-schedule.test.ts`

```ts
export function interviewDueAt(
  scheduledAt: Date,
  leadHours: number,
  now = new Date(),
): Date | null;
export function followUpDueAt(stayStartedAt: Date, followUpDays: number): Date;
```

- [ ] **Step 1: Write failing tests** — 24h lead; lead passed → null; 7d from `createdAt`

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement + pass + commit**

```bash
git commit -m "feat(api): add reminder dueAt schedule helpers"
```

---

### Task 3: MANUAL reminders HTTP API (TDD)

**Files:** reminders module, `app.ts`, `tests/reminders/reminders.manual.test.ts`, `tests/helpers/reminders.ts`

**Helper:** `seedReminder`, `expectJobExists(bullJobId)`, CSRF cookie helpers.

**Cover:**

1. Create MANUAL → 201 SCHEDULED + job present (`getJob`)
2. List user-scoped; other user excluded; `application` summary on list
3. Patch dueAt/title → new `bullJobId`; old job gone
4. Dismiss → DISMISSED + activity; job removed
5. DELETE MANUAL → CANCELLED **204**; DELETE INTERVIEW kind → 400
6. Past dueAt create/patch → 400
7. 401 unauthenticated; POST/PATCH/DELETE without CSRF → **403 CSRF_INVALID**
8. Application delete removes reminder rows + jobs cleaned post-commit

- [ ] **Step 1: Failing HTTP tests**

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement service/routes** — nested POST under applications; list/patch/delete on `/api/reminders`; enqueue after commit

- [ ] **Step 4: Pass + commit**

```bash
git commit -m "feat(api): MANUAL reminder CRUD with BullMQ enqueue"
```

---

### Task 4: `processReminderJob` + worker (TDD)

**Files:** `process-reminder-job.ts`, `worker.ts`, `tests/reminders/process-reminder-job.test.ts`, `reminder-worker.test.ts`

- [ ] **Step 1: Failing unit tests for CAS fire** — SCHEDULED→DUE + activity; second call no-op; dismiss race → no activity; `dueAt` in future → no-op (caller re-enqueues)

- [ ] **Step 2: Implement `processReminderJob`**

- [ ] **Step 3: Failing Redis integration** — enqueue delay 0; worker (or manual process after job) → DUE

- [ ] **Step 4: `startReminderWorker` + thin `worker.ts` (dotenv, SIGTERM, boot reconcile stub OK until Task 6)

- [ ] **Step 5: Pass + commit**

```bash
git commit -m "feat(api): BullMQ worker marks reminders DUE via CAS"
```

---

### Task 5: INTERVIEW + FOLLOW_UP hooks (TDD)

**Files:** `reminder-hooks.ts`, interview + application services, `tests/reminders/reminders.auto.test.ts`

**Cover:**

1. Interview create → INTERVIEW when lead in future
2. Reschedule → cancel old SCHEDULED+DUE; new row/job
3. Delete / leave SCHEDULED → cancel SCHEDULED+DUE
4. Lead passed → no row
5. Status enter APPLIED from SAVED → FOLLOW_UP
6. **createApplication** status APPLIED → FOLLOW_UP
7. APPLIED→SCREENING → **same** FOLLOW_UP row (no reset)
8. Leave set → SCHEDULED FOLLOW_UP cancelled
9. Hook uses **post-update** status; cancel-all SCHEDULED FOLLOW_UP then create-if-in-set
10. Document: `bulkUpdateStatus` uses `updateApplication`

Effects: `{row, effects}` from tx → enqueue **after** commit; enqueue failure logged.

- [ ] **Step 1: Failing tests (all cases above)**

- [ ] **Step 2: Implement hooks + wire services**

- [ ] **Step 3: Pass + commit**

```bash
git commit -m "feat(api): auto INTERVIEW and FOLLOW_UP reminder schedules"
```

---

### Task 6: Prefs API + reschedule + reconcile/sweep (TDD)

**Files:** users prefs routes, reconcile in jobs/worker, tests

- [ ] **Step 1: Failing tests** — GET defaults; PATCH validation; PATCH reschedules FOLLOW_UP from `createdAt`; INTERVIEW lead-null cancels; unchanged prefs skip work; reconcile re-adds missing job; overdue SCHEDULED gets delay-0 job → DUE

- [ ] **Step 2: Implement GET/PATCH `/api/me/reminder-prefs` on **users** module**

- [ ] **Step 3: Implement `reconcileScheduledReminders` + ~60s interval in worker**

- [ ] **Step 4: Pass + commit**

```bash
git commit -m "feat(api): reminder prefs reschedule and worker reconcile sweep"
```

---

### Task 7: Soft Chromatic web UI (TDD helpers + UI)

**Files:** types, labels, `reminder-badge.ts`+test, Modal, reminder components, AppShell, detail page

- [ ] **Step 1: Failing badge tests** — `0` hide / `9` / `10→9+`

- [ ] **Step 2: Types + ACTIVITY_TYPES + labels + timeline branches for REMINDER_***

- [ ] **Step 3: `ui/Modal.tsx`**

- [ ] **Step 4: ReminderBell** in AppShell — a11y disclosure, refetchInterval 30s, refetchOnWindowFocus true; hoist prefs modal state

- [ ] **Step 5: RemindersSection** on detail

- [ ] **Step 6: ReminderPrefsModal**

- [ ] **Step 7: lint + typecheck + web tests + commit**

```bash
git commit -m "feat(web): Soft Chromatic reminder bell, detail, prefs"
```

---

### Task 8: Dev scripts, CI Redis, docs, gate

- [ ] **Step 1: Root `package.json`**

```json
"dev": "concurrently -n api,web,worker -c blue,green,magenta \"npm run dev -w apps/api\" \"npm run dev -w apps/web\" \"npm run dev:worker -w apps/api\""
```

- [ ] **Step 2: CI** — add Redis service:

```yaml
redis:
  image: redis:7-alpine
  ports: ["6379:6379"]
  options: >-
    --health-cmd "redis-cli ping"
    --health-interval 5s
    --health-timeout 3s
    --health-retries 10
```

Job env: `REDIS_URL: redis://localhost:6379`. Optionally add `npm run test -w apps/web` to CI (or note local-only in README).

- [ ] **Step 3: README** — Phase 6 section; fix mermaid Redis “unused” → used by worker; root `.env.example`; worker scripts

- [ ] **Step 4: PROJECT_CONTEXT** — Phase 6 done-on-branch; next = Later

- [ ] **Step 5: Full gate** (Redis up)

```bash
npm run lint && npm run typecheck && npm run test && npm run test -w apps/web && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/ci.yml README.md docs/PROJECT_CONTEXT.md .env.example
git commit -m "docs: add Phase 6 reminders notes and CI Redis"
```

---

## Manual smoke

1. `docker compose up -d`; `npm run dev` — api + web + worker
2. MANUAL due ~1 min → bell shows DUE without full page reload (poll)
3. Interview +36h → INTERVIEW SCHEDULED; delete interview → gone from bell
4. Create app as APPLIED → FOLLOW_UP; move APPLIED→SCREENING → same reminder
5. Prefs followUpDays 1 → dueAt moves from `createdAt`; wait / or set dueAt past in SQL **and restart worker** so sweep enqueues delay 0
6. `FLUSHDB` while worker runs → within ~60s jobs restored / overdue fired
7. Bell: keyboard open/Esc/focus; prefs modal focus trap

## Done when

Spec acceptance checklist satisfied; gate green; ready for PR.

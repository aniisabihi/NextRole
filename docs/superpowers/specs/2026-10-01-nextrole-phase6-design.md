# NextRole — Phase 6 Design (Reminders / BullMQ)

**Date:** 2026-10-01  
**Status:** Approved — plan at `docs/superpowers/plans/2026-10-01-nextrole-phase6.md`  
**Path:** `~/Git/Me/NextRole`  
**Depends on:** Phase 2 applications; Phase 4 interviews; Soft Chromatic UI; Redis in Compose (unused until this phase)

## Goal

Ship **in-app reminders** backed by **Postgres as source of truth** and **BullMQ delayed jobs** on Redis. Separate worker OS process from the same `apps/api` package (`src/worker.ts`). Soft Chromatic UI: nav bell + dropdown, application-detail reminder CRUD, user prefs modal.

Reminder kinds:

1. **MANUAL** — user-created on an application (due time + title/body)
2. **INTERVIEW** — auto lead-time before `Interview.scheduledAt` (default **24h**, per-user prefs)
3. **FOLLOW_UP** — auto after **N days** continuous stay in `{APPLIED, SCREENING}` (default **7**, per-user prefs)

Stop before email/SMS, push, calendar sync, separate `apps/worker` workspace, admin queue UI, and custom follow-up status lists.

## Decisions (locked)

| Topic             | Choice                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Product scope     | MANUAL + INTERVIEW lead-time + FOLLOW_UP status-age                                                |
| Delivery          | **In-app only** (status flip to `DUE`; no email)                                                   |
| Source of truth   | **Postgres `Reminder` rows**; BullMQ delayed jobs mirror schedule                                  |
| Worker shape      | **`apps/api` + `src/worker.ts`** — second entrypoint, separate process, shared Prisma/code         |
| Interview default | **24 hours** before `scheduledAt`                                                                  |
| Follow-up default | **7 days** after **entering** `{APPLIED, SCREENING}` from outside the set                          |
| Follow-up stay    | Continuous presence in set; **APPLIED→SCREENING does not reset** clock / create second nudge       |
| Prefs             | Per-user UI; **reschedule open `SCHEDULED` autos on prefs save** (base = reminder `createdAt`)     |
| Prefs routes      | Under **users** module: `GET/PATCH /api/me/reminder-prefs`                                         |
| UI                | Nav **bell + dropdown**, detail **Reminders** section, **prefs modal** (`ui/Modal` or `<dialog>`)  |
| Activity timeline | Log **fire** and **dismiss** only                                                                  |
| Job id            | **`reminder-${id}-${dueAtMs}`** (no `:` — BullMQ forbids); persist in `bullJobId`; remove-then-add |
| Job retention     | `removeOnComplete: true`, `removeOnFail: true`                                                     |
| Redis wipe        | **Reconcile** on worker boot **and** periodic sweep (~60s)                                         |
| Overdue SCHEDULED | **Mandatory** on reconcile/sweep: enqueue with `delay = max(0, dueAt - now)` (shared fire path)    |
| Fire concurrency  | **CAS**: `updateMany` where `status=SCHEDULED` (and `dueAt <= now+skew`); activity iff count=1     |
| Enqueue failure   | `enableOfflineQueue: false`; catch/log; **do not fail HTTP**; sweep repairs                        |
| DELETE vs dismiss | DELETE = soft **`CANCELLED`** for **MANUAL** only; autos use dismiss                               |
| Auth / CSRF       | `authGuard`; CSRF + Origin on mutations (global preHandler — assert `403 CSRF_INVALID`)            |
| `REDIS_URL`       | **Default** `redis://127.0.0.1:6379` (tests/CI must not require unset-env fail)                    |
| Non-goals         | Email, SMS, push, calendar, `apps/worker` package, admin Bull Board, Redis-backed auth             |

## Architecture

```text
Browser
  │  CRUD / list / prefs  (Vite → /api)
  │  Bell: GET /api/reminders (refetchInterval 30–60s + refetchOnWindowFocus on that query)
  ▼
apps/api (Fastify)
  modules/reminders/  +  jobs/reminder-queue.ts
  │  Prisma Reminder + User prefs
  │  BullMQ Queue.add / remove (REDIS_URL)
  ▼
Redis (BullMQ)          PostgreSQL
  delayed jobs    ←→      Reminder rows (truth)
  ▲
apps/api worker process (src/worker.ts)
  startReminderWorker() → processReminderJob(id)  // extractable for unit tests
```

**Dev:** `npm run dev` runs API + web + worker via concurrently.  
**Scripts:** `dev:worker` (tsx watch), `worker` (tsx once), `start:worker` (`node dist/worker.js`). SIGTERM closes queue/worker.

## Data model

### Enums

```prisma
enum ReminderKind {
  MANUAL
  INTERVIEW
  FOLLOW_UP
}

enum ReminderStatus {
  SCHEDULED
  DUE
  DISMISSED
  CANCELLED
}
```

### `Reminder`

| Field                     | Notes                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| `id`                      | cuid                                                                  |
| `userId`                  | owner; cascade with User                                              |
| `applicationId`           | required; cascade with Application                                    |
| `kind`                    | ReminderKind                                                          |
| `interviewId`             | optional FK; set when `kind = INTERVIEW`; `onDelete: SetNull`         |
| `title`                   | string; MANUAL user-editable; autos use system copy                   |
| `body`                    | optional string                                                       |
| `dueAt`                   | DateTime                                                              |
| `status`                  | ReminderStatus                                                        |
| `bullJobId`               | optional; last enqueued id (`reminder-${id}-${dueAtMs}`)              |
| `firedAt`                 | optional DateTime when moved to `DUE`                                 |
| `createdAt` / `updatedAt` | timestamps; FOLLOW_UP prefs reschedule uses `createdAt` as stay start |

**Indexes:**

- `@@index([userId, status, dueAt])`
- `@@index([status, dueAt])` — worker / reconcile
- `@@index([applicationId])`
- `@@index([interviewId])`

**Partial unique (raw SQL in migration — Prisma cannot express):**

```sql
CREATE UNIQUE INDEX reminder_one_scheduled_follow_up
  ON "Reminder" ("applicationId")
  WHERE kind = 'FOLLOW_UP' AND status = 'SCHEDULED';

CREATE UNIQUE INDEX reminder_one_scheduled_interview
  ON "Reminder" ("interviewId")
  WHERE kind = 'INTERVIEW' AND status = 'SCHEDULED' AND "interviewId" IS NOT NULL;
```

Service still cancels before create (idempotent). INTERVIEW requires `interviewId` at service/Zod layer (DB cannot enforce “required when kind”).

**Application / User delete:** cascade removes Reminder rows. Collect `SCHEDULED` ids **before** delete and `removeReminderJob` post-commit (avoid orphan Redis jobs). Worker no-ops missing rows if a job slips through.

### User prefs

Columns on `User`:

| Field                | Type | Default |
| -------------------- | ---- | ------- |
| `interviewLeadHours` | Int  | 24      |
| `followUpDays`       | Int  | 7       |

Validation: lead hours `1…168`; follow-up days `1…90`.

### Activities

Extend `ActivityType`:

- `REMINDER_FIRED`
- `REMINDER_DISMISSED`

Payload: `{ reminderId, kind, title }`.  
Web: extend `ACTIVITY_TYPES` + detail timeline renderer (Task 7).

## Scheduling rules

### MANUAL

- Create → `SCHEDULED` + enqueue; **reject `dueAt ≤ now`** (`400 VALIDATION`)
- Patch title/body/`dueAt` while `SCHEDULED` → remove old job, update, re-enqueue (new versioned `bullJobId`); **reject past `dueAt` on patch too**
- Dismiss (`SCHEDULED` or `DUE`) → CAS to `DISMISSED` + `REMINDER_DISMISSED` activity; remove job if pending
- DELETE → soft **`CANCELLED`** for **MANUAL** only; remove job; autos → use dismiss (DELETE on auto → `400` or `404`)
- Idempotent dismiss on already `DISMISSED`/`CANCELLED` → **200** current row (no-op)

### INTERVIEW

- On interview **create** or **`scheduledAt` change** (status still `SCHEDULED`): cancel existing `SCHEDULED` **and** `DUE` INTERVIEW rows for that interview; if `interviewDueAt(...)` non-null → create + enqueue; if lead already passed → **skip** (no row)
- On interview **delete** or status leave `SCHEDULED`: cancel `SCHEDULED` **and** `DUE` INTERVIEW reminders for that interview (remove jobs)
- Title e.g. `Interview reminder: {company} — {type}`

### FOLLOW_UP

- **Stay** = continuous membership in `{APPLIED, SCREENING}`
- Create FOLLOW_UP only when status **enters** the set from outside (including **createApplication** with initial `APPLIED`/`SCREENING`)
- **APPLIED → SCREENING** (or reverse): **do not** cancel/recreate; clock unchanged
- When status **leaves** the set: cancel `SCHEDULED` FOLLOW_UP (leave existing `DUE` for user dismiss — or cancel DUE too? **Cancel SCHEDULED only** for leave-set; DUE stays until dismiss so user sees it)
- After fire (`DUE`), no auto-repeat until a **new enter** from outside the set
- Title e.g. `Follow up: {company}`
- Status hooks use **final** `application.status` after `tx.update` (not pre-tx `existing`); cancel-all-SCHEDULED-FOLLOW_UP then create-if-in-set for idempotency under concurrency
- `bulkUpdateStatus` already goes through `updateApplication` — one hook point

### Prefs save

- PATCH prefs only if values **changed**
- Reschedule user’s `SCHEDULED` `INTERVIEW` (interview still `SCHEDULED`) and `SCHEDULED` `FOLLOW_UP`:
  - INTERVIEW: `dueAt = interviewDueAt(scheduledAt, newLead)`; if null → cancel that reminder
  - FOLLOW_UP: `dueAt = createdAt + followUpDays`; if `dueAt ≤ now` → enqueue with `delay: 0` (fire path)
- DB updates in one transaction; enqueue post-commit
- MANUAL unchanged

### Worker / fire

- Extract **`processReminderJob(reminderId)`** (DB CAS + activity) for unit tests without Redis
- Payload `{ reminderId }`
- If row missing → ack no-op
- If `dueAt > now + skew` → no-op ack and **re-enqueue** with correct delay (stale job guard)
- Else `updateMany` where `id` + `status=SCHEDULED` (+ optional `dueAt <= now+skew`); if count≠1 → no-op; else activity `REMINDER_FIRED`
- Worker Redis: `maxRetriesPerRequest: null`

### Reconcile + sweep

**On boot and every ~60s:**

1. All `SCHEDULED` reminders (including overdue)
2. For each: if no job for current `bullJobId` (or job missing), `enqueue` with `delay = max(0, dueAt - now)` and versioned id
3. Prefer shared enqueue helper — never bypass fire CAS by direct “mark DUE” in reconcile except via `delay: 0` job

## API contract

All routes: auth required. Mutations: CSRF + Origin (global).

### `GET /api/reminders`

Query:

- `status` — optional **comma-separated** (`DUE,SCHEDULED`)
- `applicationId` — optional filter for detail section
- `limit` — default 20, max 50

**200:** `{ items: ReminderDto[] }` ordered by **`dueAt` asc** (past DUE naturally first).

List/bell **include** `application: { id, company, title }`.

### `POST /api/applications/:applicationId/reminders`

Body: `{ title, body?, dueAt }` → MANUAL. **201** ReminderDto.

### `PATCH /api/reminders/:id`

- MANUAL `SCHEDULED`: `title`, `body`, `dueAt`
- `SCHEDULED`/`DUE`: `{ status: "DISMISSED" }`

**200** ReminderDto. Wrong owner → 404.

### `DELETE /api/reminders/:id`

MANUAL only → soft `CANCELLED` + remove job. **204**. Auto kinds → `400 VALIDATION` (use dismiss).

### `GET /api/me/reminder-prefs` / `PATCH /api/me/reminder-prefs`

As above; PATCH triggers autos reschedule when values change.

### ReminderDto

```ts
{
  id: string;
  applicationId: string;
  kind: ReminderKind;
  interviewId: string | null;
  title: string;
  body: string | null;
  dueAt: string; // ISO
  status: ReminderStatus;
  firedAt: string | null;
  createdAt: string;
  application?: { id: string; company: string; title: string };
}
```

## Frontend

### Bell

- Place in **AppShell** header beside `AppNav` (nav is NavLinks only)
- Badge visual `9+`; **`aria-label`** with exact count (`Reminders, 12 due`)
- Disclosure (`aria-expanded` / `aria-controls`); Esc + click-outside close; focus return
- Not `role="menu"` unless full arrow-key menu implemented
- Dropdown: DUE + next few SCHEDULED; row link; separate dismiss control (no nested interactive)
- Footer opens prefs — **modal state hoisted** above dropdown so menu unmount doesn’t kill modal
- Query: `refetchInterval: 30_000`–`60_000` + `refetchOnWindowFocus: true` **on this query only** (global client has focus refetch off)

### Detail + prefs

- Reminders section near Interviews
- `ui/Modal.tsx` (or native `<dialog>`): focus trap, labelled fields, min/max matching server, restore focus

### Query keys

`["reminders"]`, `["reminders", applicationId]`, `["reminder-prefs"]` — invalidate on mutations/prefs

## Testing

- Pure schedule math; MANUAL CRUD + CSRF `403`; ownership 404
- Interview / FOLLOW_UP lifecycle including create-as-APPLIED, APPLIED→SCREENING no reset, concurrency cancel-all
- Prefs reschedule from `createdAt`; lead-null cancels INTERVIEW
- `processReminderJob` unit (CAS); Redis integration for worker with **test queue prefix** / DB index; `obliterate` in `beforeEach`; close queue on `app` onClose / `afterAll`
- Never share queue with a long-running `npm run dev` worker without prefix isolation
- Web: badge cap helper test; activity label branches

## Docs / gate

- README Phase 6 + update architecture diagram (Redis used); root `.env.example` `REDIS_URL`
- CI: Redis service + `REDIS_URL`; note web tests in local gate (add to CI if cheap)
- `PROJECT_CONTEXT`: Phase 6 done-on-branch / next = Later
- Gate: lint + typecheck + test + test -w web + build (Redis up)

## Acceptance checklist

1. MANUAL → job → worker CAS → `DUE` + bell (poll/refetch shows without full reload)
2. Interview lead-time; reschedule/delete cancels SCHEDULED+DUE; versioned job ids
3. Enter APPLIED/SCREENING → FOLLOW_UP; APPLIED→SCREENING no reset; leave set cancels SCHEDULED
4. Prefs save reschedules autos from `createdAt` / interview time
5. Redis flush + worker running → sweep restores jobs / overdue fires via delay 0
6. Soft Chromatic bell a11y + modal + detail; no email
7. README + PROJECT_CONTEXT; gate green

## Non-goals (Phase 6)

Email/SMS/push, calendar sync, separate `apps/worker` package, Bull Board, custom follow-up status picker, repeating MANUAL series, timezone picker UI (UTC only; document), file uploads, `__Host-` cookies.

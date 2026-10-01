# NextRole — Phase 4 Design (Interviews)

**Date:** 2026-10-01  
**Status:** Approved — implementation plan next  
**Path:** `~/Git/Me/NextRole`  
**Depends on:** Phase 2 applications core; Phase 3 Kanban (on `main`, no board changes this phase)

## Goal

Ship **interview CRUD nested under applications**: schedule and manage interviews on the application detail page, with status lifecycle, activity timeline events, and FE that meets the Phase 3 a11y bar for this surface.

Stop before board/list interview signals, calendar/agenda views, reminders/BullMQ, and dashboard analytics.

## Decisions (locked)

| Topic               | Choice                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Success slice       | CRUD on application detail only                                                                                 |
| Approach            | Nested REST under applications                                                                                  |
| Module              | Dedicated `apps/api/src/modules/interviews/` (not under applications routes file)                               |
| Interview status    | `SCHEDULED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`                                                                |
| Status transitions  | **One-way:** `SCHEDULED` → `{COMPLETED, CANCELLED, NO_SHOW}` only; no reopen                                    |
| Create status       | Always `SCHEDULED`; body `status` stripped by Zod (unknown keys stripped; not `.strict()`)                      |
| Interview type      | `PHONE`, `VIDEO`, `ONSITE`, `TECHNICAL`, `OTHER`                                                                |
| Type label          | Trimmed; required when effective `type=OTHER`; otherwise coerced to `null`                                      |
| Activities          | Create / field update / status change / delete; **same transaction** as mutation                                |
| Dual PATCH          | Match Phase 2: emit **both** `INTERVIEW_STATUS_CHANGED` and `INTERVIEW_UPDATED` when both apply (one tx)        |
| Datetime            | Store UTC; API requires ISO-8601 **with offset**; FE `datetime-local` ↔ helpers                                 |
| Delete              | Hard delete; `INTERVIEW_DELETED` activity then row delete in one tx; HTTP **204** empty                         |
| List                | All for app; sort `scheduledAt asc`, `id asc`; **hard cap 50** interviews per application                       |
| Concurrent status   | Last-write-wins (same as Phase 3 board); no row versioning                                                      |
| Terminal field edit | Only `interviewer`, `locationOrUrl`, `notes` (not `scheduledAt` / `type` / `typeLabel` / `status`)              |
| App coupling        | Interviews allowed on any application status; **no** auto status change; **no** bump of `Application.updatedAt` |
| FE surface          | Detail page Interviews section **above Timeline**, **outside** application `<form>`                             |
| Transition mirror   | API `assertInterviewTransition`; web `canTransitionInterviewStatus` (no shared package)                         |
| Non-goals           | Board/list badges, calendar, reminders, analytics, reopen, global interviews index, embed in application PATCH  |

## Architecture

```text
Browser /applications/:id  (Interviews section)
  │  GET/POST  /api/applications/:applicationId/interviews
  │  PATCH/DELETE /api/applications/:applicationId/interviews/:id
  │  canTransitionInterviewStatus (web)
  ▼
apps/api/src/modules/interviews/
  │  routes.ts  schemas.ts  interviews.service.ts
  │  interview-status-transitions.ts
  │  Ownership: getApplication(userId, applicationId) then interview { id, applicationId }
  │  Activity writes (userId = authenticated user) in $transaction with mutation
  ▼
PostgreSQL Interview + Activity
```

Register interviews plugin from `app.ts` (prefix `/api/applications/:applicationId/interviews`). CSRF/Origin are **global** hooks (Phase 1); routes use `{ preHandler: [authGuard] }` per mutating/read route. No shadowing of application `/:id` (extra path segment).

Diff helpers (`valuesEqual`, field diff serialization): **extract** from applications service into a small shared module (e.g. `apps/api/src/modules/activities/field-diff.ts`) reused by applications + interviews — avoid copy-paste.

## Data model

```prisma
enum InterviewType {
  PHONE
  VIDEO
  ONSITE
  TECHNICAL
  OTHER
}

enum InterviewStatus {
  SCHEDULED
  COMPLETED
  CANCELLED
  NO_SHOW
}

model Interview {
  id             String          @id @default(cuid())
  applicationId  String
  application    Application     @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  scheduledAt    DateTime
  type           InterviewType
  typeLabel      String?
  status         InterviewStatus @default(SCHEDULED)
  interviewer    String?
  locationOrUrl  String?
  notes          String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([applicationId, scheduledAt])
}
```

`Application` gains `interviews Interview[]`.

### Field limits / nullability

| Field           | Create       | PATCH                            | Limits / notes                                                                                                                                                               |
| --------------- | ------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheduledAt`   | required     | optional (forbidden if terminal) | ISO string **with offset** (`z.string().datetime({ offset: true })`); reject date-only / offset-less; year must be Prisma-safe (reject if `getUTCFullYear()` outside 1…9999) |
| `type`          | required     | optional (forbidden if terminal) | enum                                                                                                                                                                         |
| `typeLabel`     | see rules    | see rules                        | trim; max **100**; whitespace-only = empty                                                                                                                                   |
| `status`        | not accepted | optional                         | enum; transition rules                                                                                                                                                       |
| `interviewer`   | optional     | optional, `null` clears          | trim; max **200**                                                                                                                                                            |
| `locationOrUrl` | optional     | optional, `null` clears          | trim; max **2000**; free text (not URL-validated server-side)                                                                                                                |
| `notes`         | optional     | optional, `null` clears          | trim; max **10000**                                                                                                                                                          |

Empty PATCH `{}` → `400` (same refine as Phase 2). No-op PATCH (after coerce, no effective change) → return current row, **no** activity.

### `typeLabel` effective-state rules (service, after merge)

1. Trim inputs; empty / whitespace → treat as empty.
2. Effective `type === OTHER` ⇒ non-empty `typeLabel` required → else `400`.
3. Effective `type !== OTHER` ⇒ `typeLabel` coerced to `null` (even if client sent a string).
4. PATCH `type: OTHER` with omitted `typeLabel` and existing null/empty label → `400`.
5. PATCH away from `OTHER` → clear `typeLabel`; include in activity field diff.
6. PATCH `typeLabel` alone on non-OTHER → coerce null; no activity if already null.
7. Compute activity diffs **after** coercion (no phantom diffs).

### ActivityType additions

| Type                       | When                          |
| -------------------------- | ----------------------------- |
| `INTERVIEW_CREATED`        | After create (same tx)        |
| `INTERVIEW_UPDATED`        | Non-status field changes only |
| `INTERVIEW_STATUS_CHANGED` | Status transition             |
| `INTERVIEW_DELETED`        | Before row delete (same tx)   |

`Activity.type` = column only — **do not** duplicate activity type inside payload. Use `interviewType` for the interview’s type enum.

#### Payload shapes (pinned)

```ts
// INTERVIEW_CREATED | INTERVIEW_DELETED — full row snapshot (timeline must not need a live Interview)
{
  interviewId: string;
  interviewType: InterviewType;
  typeLabel: string | null;
  status: InterviewStatus;
  scheduledAt: string; // ISO
  interviewer: string | null;
  locationOrUrl: string | null;
  notes: string | null;
}

// INTERVIEW_UPDATED — same pattern as FIELDS_UPDATED
{
  interviewId: string;
  fields: Record<string, { from: unknown; to: unknown }>;
}

// INTERVIEW_STATUS_CHANGED
{
  interviewId: string;
  from: InterviewStatus;
  to: InterviewStatus;
}
```

Dual PATCH (status + fields): emit **both** activity rows in one transaction (Phase 2 pattern: status activity + fields activity; fields payload excludes `status`).

Orphan note: after interview delete, `INTERVIEW_*` activities remain on the application with snapshot payloads; FE must **not** navigate by `interviewId`. Application delete cascades interviews **and** activities.

## Status transitions

```ts
// apps/api/.../interview-status-transitions.ts
// AppError(code, statusCode, message) — same order as Phase 2 assertTransition
export function canTransitionInterviewStatus(
  from: InterviewStatus,
  to: InterviewStatus,
): boolean {
  if (from === to) return true;
  return (
    from === "SCHEDULED" &&
    (to === "COMPLETED" || to === "CANCELLED" || to === "NO_SHOW")
  );
}

export function assertInterviewTransition(
  from: InterviewStatus,
  to: InterviewStatus,
): void {
  if (!canTransitionInterviewStatus(from, to)) {
    throw new AppError(
      "INVALID_INTERVIEW_STATUS_TRANSITION",
      400,
      `Cannot change interview status from ${from} to ${to}`,
    );
  }
}
```

Web: `apps/web/src/lib/interview-status-transitions.ts` — `canTransitionInterviewStatus` only + vitest matrix (same-status true; terminal→anything false except same).

Misclick cost: terminal is final (no reopen). FE confirms before COMPLETED / CANCELLED / NO_SHOW actions.

## API

| Method   | Path                                              | Success                        |
| -------- | ------------------------------------------------- | ------------------------------ |
| `GET`    | `/api/applications/:applicationId/interviews`     | `200` `{ items: Interview[] }` |
| `POST`   | `/api/applications/:applicationId/interviews`     | `201` `{ interview }`          |
| `PATCH`  | `/api/applications/:applicationId/interviews/:id` | `200` `{ interview }`          |
| `DELETE` | `/api/applications/:applicationId/interviews/:id` | `204` empty                    |

### Ownership

1. `getApplication(userId, applicationId)` — missing → `404`
2. Interview lookup `{ id, applicationId }` — missing → `404` (includes same-user wrong-applicationId)

### Create body

Required: `scheduledAt`, `type`. Optional: `typeLabel`, `interviewer`, `locationOrUrl`, `notes`.  
`status` / unknown keys: stripped (not 400). Count interviews for app; if `>= 50` → `400` `INTERVIEW_LIMIT_EXCEEDED`.

### PATCH body

Partial of create fields + `status`. `null` clears nullable strings.  
If current status is terminal:

- `status` change (including terminal→other terminal) → `400 INVALID_INTERVIEW_STATUS_TRANSITION`
- `scheduledAt` / `type` / `typeLabel` present → `400` `INTERVIEW_TERMINAL_FIELDS_LOCKED`
- `interviewer` / `locationOrUrl` / `notes` allowed

### Datetime contract

- API: offset-required ISO only — **do not** reuse `optionalDateInputSchema` / `parseOptionalDateInput`.
- FE create/edit: `fromDatetimeLocal(value)` → `toISOString()` for request; prefills via `toDatetimeLocal(iso)` (local wall time, minute precision).
- Diff compare: epoch **minutes** (avoid spurious diffs from dropped seconds).
- Vitest for helpers: set `process.env.TZ` deterministically; cover DST spring-forward if practical.

### Errors (codes)

| Code                                  | HTTP | When                                                 |
| ------------------------------------- | ---- | ---------------------------------------------------- |
| (generic)                             | 404  | Wrong owner / missing app or interview               |
| `INVALID_INTERVIEW_STATUS_TRANSITION` | 400  | Illegal status move                                  |
| `INTERVIEW_TERMINAL_FIELDS_LOCKED`    | 400  | Terminal + locked field in PATCH                     |
| `INTERVIEW_LIMIT_EXCEEDED`            | 400  | Create when count ≥ 50                               |
| Zod / validation                      | 400  | Bad datetime, OTHER without label, empty PATCH, etc. |
|                                       | 401  | Unauthenticated                                      |
|                                       | 403  | CSRF / Origin (global hooks)                         |

## Frontend

### Layout

- Interviews `<section aria-labelledby="interviews-heading">` with `<h2 id="interviews-heading">` **above Timeline**, **after** closing the application edit `</form>`.
- Query: `["application-interviews", applicationId]`. Invalidate that + `["application-activities", applicationId]` after mutations. **Do not** invalidate `["applications"]` / `["application", id]` (no `updatedAt` bump; no board signal).

### List UX

- FE groups: **Upcoming** (`SCHEDULED`, soonest first) then **Past** (non-SCHEDULED + past scheduled, keep API order within groups or by `scheduledAt`).
- Row: local datetime (+ optional short TZ name via `Intl` if cheap), human label maps for type/status (`No-show`, `Video`, …), interviewer, locationOrUrl.
- Empty: `No interviews yet.` Loading: `Loading interviews…` Error: `role="alert"` + retry.
- Mutation errors: separate from application Save error state (`role="alert"`).

### Safe URL display

Helper `linkIfHttpUrl(value: string): string | null` — only `http:` / `https:` via `URL` parse; else plain text. Links: `target="_blank"` `rel="noopener noreferrer"`. Unit tests.

### Forms

- Shared create/edit form component (inline panel, not modal).
- Add opens panel; Edit opens same with prefill; Cancel closes; Save PATCHes via `buildInterviewPatch` vs server row.
- Focus: open → first field; save/cancel success → focus Edit (or Add) control for that row / section.
- Status actions only when `SCHEDULED`; confirm via `window.confirm` (acceptable Phase 4; no dialog system yet).
- Delete: `window.confirm`; on success focus Interviews heading or next row.
- Terminal rows: only notes/interviewer/location fields editable.
- `typeLabel` input shown when type is OTHER.
- Action buttons: unique `aria-label` including datetime + type (e.g. `Edit interview, 3 Oct 2026 14:00, Video`).

### Types / timeline

Extend web types: `INTERVIEW_TYPES`, `INTERVIEW_STATUSES`, `Interview`, list/response envelopes, `ACTIVITY_TYPES` + payload unions.  
`ActivityItem`: explicit branches for all four interview activity types (no raw-type fallback for these).

### A11y

- Focus-visible; ~44px targets on icon/text buttons where reasonable
- Status/type as text (+ label map), not color-only
- Labeled fields; section landmark
- `role="alert"` errors; `role="status"` for success/announcements (e.g. “Interview saved”)
- Focus restore after delete/status as above
- No motion → reduced-motion N/A

## Testing

### API (required)

- CRUD + `201`/`204` shapes
- Cross-user GET/PATCH/DELETE → 404
- Same-user interview under wrong `applicationId` → 404
- OTHER / typeLabel matrix (incl. coerce, whitespace, PATCH merge)
- Status one-way + reopen reject + terminal→terminal reject
- Terminal locked fields → `INTERVIEW_TERMINAL_FIELDS_LOCKED`
- Same-status / no-op PATCH → no activity
- Empty PATCH `{}` → 400
- Offset-less / date-only `scheduledAt` → 400
- `status` on create stripped (still 201 SCHEDULED)
- Limit 50 → `INTERVIEW_LIMIT_EXCEEDED`
- Activity payloads exact shapes; dual PATCH emits two activities
- Delete: activity then gone in one tx; cascade app delete removes interviews
- CSRF/auth on mutations
- GET order `scheduledAt`, `id`

### Web

- `canTransitionInterviewStatus` full matrix
- `toDatetimeLocal` / `fromDatetimeLocal` with fixed `TZ`
- `linkIfHttpUrl`
- `buildInterviewPatch` (minute compare; null clears)

### Manual (README checklist)

Add / edit / status confirm / delete; timeline updates; keyboard focus-visible; terminal field lock.

### Gate

`npm run lint && npm run typecheck && npm run test && npm run test -w apps/web && npm run build`

## Docs

- README Phase 4: endpoints, enums, one-way rule, field locks, datetime contract, cap 50, detail UX + checklist
- `PROJECT_CONTEXT`: Phase 3 **done on `main`**; Phase 4 in progress / done-on-branch; next = dashboard analytics
- Migration: one Prisma migration; `ActivityType` `ALTER TYPE … ADD VALUE` — new enum values not used in same SQL transaction as dependent DML (Prisma default handling; note in plan)

## Acceptance

1. Nested interview CRUD for owner; others 404; wrong-app id 404.
2. One-way status + terminal field lock enforced server + FE.
3. Timeline renders all four interview activity types from pinned payloads.
4. Detail Interviews section complete, accessible (landmark, focus-visible, alerts).
5. Cap 50; datetime offset-required; non-goals respected.

## Spec self-review

- Module path, section order, form UX, payloads, dual-PATCH, typeLabel merge, datetime, limits, codes, DELETE 204 — pinned (no “or” / “if useful” leftovers).
- Terminology: **one-way** (not “soft” in Phase 2 reopen sense).
- Orphan activities after interview delete: intentional; payloads self-contained.
- Cascade app delete: interviews + activities; required test.
- `locationOrUrl` remains free text; FE link hardening only.
- Concurrent status: last-write-wins (documented).

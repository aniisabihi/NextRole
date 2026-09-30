# NextRole — Phase 2 Design

**Date:** 2026-09-30  
**Status:** Approved — implementation plan next  
**Path:** `~/Git/Me/NextRole`  
**Depends on:** Phase 1 auth (`docs/superpowers/specs/2026-09-30-nextrole-phase1-design.md`)

## Goal

Ship **applications core** on top of Phase 1 auth: CRUD, list/search/filter/sort, detail page, ownership isolation, soft status-transition rules, and a persistent activity timeline (create / status / field updates). Stop before Kanban, interviews, reminders, and dashboard analytics.

## Decisions (locked)

| Topic                                | Choice                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Scope                                | Applications core only (option A)                                                               |
| Status transitions                   | Soft rules (option B)                                                                           |
| Activities                           | Field-aware: `APPLICATION_CREATED`, `STATUS_CHANGED`, `FIELDS_UPDATED`                          |
| Contact / salary / workplace         | Flat on `Application`; `employmentType` ≠ `workplaceType`                                       |
| Architecture                         | Single `applications` module; activities as service side-effects (no public activity write API) |
| Kanban / interviews / BullMQ / stats | Deferred                                                                                        |
| Delete                               | Hard delete (cascade activities)                                                                |
| Cross-user access                    | `404 NOT_FOUND` (no leak)                                                                       |

## Architecture

```text
Browser (apps/web)
   │  credentials + CSRF (existing Phase 1)
   ▼
Fastify (apps/api)
   │  authGuard (existing)
   │  modules/applications/
   │    routes.ts / schemas.ts
   │    applications.service.ts
   │    status-transitions.ts
   ▼
PostgreSQL — User (P1), Application, Activity
```

Follow Phase 1: thin routes, Zod, services, Prisma boundary, no repository layer, no shared package.

## Data model

### Enums

- **ApplicationStatus:** `SAVED`, `APPLIED`, `SCREENING`, `INTERVIEW`, `TECHNICAL_INTERVIEW`, `OFFER`, `REJECTED`, `WITHDRAWN`
- **Priority:** `LOW`, `MEDIUM`, `HIGH` (default `MEDIUM`)
- **EmploymentType:** `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `OTHER`
- **WorkplaceType:** `ON_SITE`, `HYBRID`, `REMOTE`
- **ActivityType:** `APPLICATION_CREATED`, `STATUS_CHANGED`, `FIELDS_UPDATED`

### Application

| Field                     | Notes                                                           |
| ------------------------- | --------------------------------------------------------------- |
| `id`                      | `cuid()`                                                        |
| `userId`                  | FK → User, `onDelete: Cascade`                                  |
| `company`                 | required; trim; max **200**                                     |
| `title`                   | required; trim; max **200**                                     |
| `location`                | optional; max **200** (city/region text)                        |
| `employmentType`          | optional enum (contract shape)                                  |
| `workplaceType`           | optional enum (`ON_SITE` / `HYBRID` / `REMOTE`)                 |
| `salary`                  | optional text; max **100**                                      |
| `jobUrl`                  | optional; if set must be valid `http`/`https` URL; max **2000** |
| `dateDiscovered`          | optional `DateTime`                                             |
| `dateApplied`             | optional `DateTime`                                             |
| `status`                  | enum; default `SAVED`                                           |
| `priority`                | enum; default `MEDIUM`                                          |
| `priorityRank`            | int; `LOW=1`, `MEDIUM=2`, `HIGH=3`; default `2`; used for sort  |
| `notes`                   | optional; max **10_000**                                        |
| `contactName`             | optional; max **200**                                           |
| `contactEmail`            | optional; if set valid email; max **255**                       |
| `contactPhone`            | optional; max **50**                                            |
| `contactRole`             | optional; max **200**                                           |
| `resumeVersion`           | optional label; max **200**                                     |
| `coverLetterVersion`      | optional label; max **200**                                     |
| `createdAt` / `updatedAt` |                                                                 |

**Indexes:** `(userId, status)`, `(userId, company)`, `(userId, updatedAt)`, `(userId, priority)`.

**Dates:** API accepts ISO-8601 datetime **or** `YYYY-MM-DD`. Date-only → store as UTC midnight that calendar day. Response always ISO datetime strings.

### Activity

| Field           | Notes                                                     |
| --------------- | --------------------------------------------------------- |
| `id`            | `cuid()`                                                  |
| `applicationId` | FK → Application, cascade delete                          |
| `userId`        | denormalized owner (must match application.userId)        |
| `type`          | `ActivityType` column — **not** duplicated inside payload |
| `payload`       | `Json` — shape depends on `type` (below)                  |
| `createdAt`     |                                                           |

**Index:** `(applicationId, createdAt)`.

### Soft status transitions

**Non-terminal (pipeline):** `SAVED`, `APPLIED`, `SCREENING`, `INTERVIEW`, `TECHNICAL_INTERVIEW`  
**Terminal:** `OFFER`, `REJECTED`, `WITHDRAWN`

| From \ To            | Non-terminal              | Terminal |
| -------------------- | ------------------------- | -------- |
| Non-terminal         | allow                     | allow    |
| `OFFER` / `REJECTED` | **deny**                  | allow    |
| `WITHDRAWN`          | only `SAVED` or `APPLIED` | allow    |

Additional:

- `from === to` → no-op (skip write + skip activity).
- Deny → `400` `INVALID_STATUS_TRANSITION`.

Pure function: `assertTransition(from, to): void` throws `AppError`. Unit-test the matrix.

**Create:** client may set any initial `status` (default `SAVED`). **No** transition check on create (no prior status). Only `APPLICATION_CREATED` activity (not `STATUS_CHANGED`).

## API

All routes authenticated. Mutations use existing CSRF + Origin.

| Method   | Path                               | Success                        |
| -------- | ---------------------------------- | ------------------------------ |
| `GET`    | `/api/applications`                | `200` list envelope            |
| `POST`   | `/api/applications`                | `201` `{ application }`        |
| `GET`    | `/api/applications/:id`            | `200` `{ application }`        |
| `PATCH`  | `/api/applications/:id`            | `200` `{ application }`        |
| `DELETE` | `/api/applications/:id`            | `204` empty                    |
| `GET`    | `/api/applications/:id/activities` | `200` `{ items }` newest-first |

### List query

| Param            | Behavior                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `q`              | Optional; ilike OR across `company` + `title`                                               |
| `status`         | Optional exact enum                                                                         |
| `company`        | Optional; ilike **contains** on `company`                                                   |
| `employmentType` | Optional exact enum                                                                         |
| `workplaceType`  | Optional exact enum                                                                         |
| `priority`       | Optional exact enum                                                                         |
| `sort`           | `updatedAt` \| `createdAt` \| `dateApplied` \| `priority` \| `status` (default `updatedAt`) |
| `order`          | `asc` \| `desc` (default `desc`)                                                            |
| `page`           | 1-based (default 1)                                                                         |
| `pageSize`       | default 20, max 50                                                                          |

**Priority sort:** not alphabetical — order `LOW < MEDIUM < HIGH` (asc) / reverse (desc). **Implementation:** maintain `priorityRank Int` on `Application` (`LOW=1`, `MEDIUM=2`, `HIGH=3`) and `orderBy: { priorityRank }`. Set rank whenever `priority` is written.

Response:

```json
{ "items": [/* Application */], "total": 0, "page": 1, "pageSize": 20 }
```

### Create / PATCH validation

- Required on create: `company`, `title`.
- PATCH: at least one updatable field; empty object → `400 VALIDATION_ERROR`.
- Clearing optional fields: send JSON `null` (omit = leave unchanged).
- Updatable fields = all Application scalars except `id`, `userId`, `createdAt`, `updatedAt`.

### Ownership

Every query includes `userId = request.userId`. Wrong/missing id → `404` `NOT_FOUND`.

### Activities

Payloads (**type is column only**):

```json
// APPLICATION_CREATED
{ "company": "Acme", "title": "Backend Engineer", "status": "SAVED" }

// STATUS_CHANGED
{ "from": "APPLIED", "to": "SCREENING" }

// FIELDS_UPDATED
{
  "fields": {
    "notes": { "from": null, "to": "Follow up Friday" },
    "workplaceType": { "from": "ON_SITE", "to": "HYBRID" }
  }
}
```

Rules:

- Create → one `APPLICATION_CREATED` (snapshot: company, title, status).
- PATCH with status change → `STATUS_CHANGED` (after `assertTransition`).
- PATCH with other field changes → one `FIELDS_UPDATED` (only changed keys; **exclude** `status`).
- Both in one PATCH → both rows in **one transaction** with the update.
- Unchanged values → not listed.
- `GET …/activities`: newest-first; Phase 2 returns all rows for that application up to **soft cap 200** (no pagination UI yet). If over cap, return latest 200 (document in README).

No public write API for activities.

## Frontend

| Route               | Purpose                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `/applications`     | List + `q` + filters (status, company, employmentType, workplaceType, priority) + sort + pagination |
| `/applications/new` | Create form (both employment + workplace selects)                                                   |
| `/applications/:id` | Edit fields, status control, timeline                                                               |
| `/dashboard`        | Link to applications + optional recent 5; **no fake stats**                                         |

- Register routes in `App.tsx`; add simple nav (Dashboard / Applications) on authenticated pages.
- Post-login stays `/dashboard` (Phase 1 behavior).
- Reuse `apiClient` + TanStack Query.
- Functional Tailwind UI; no Kanban.

## Module layout

```text
apps/api/src/modules/applications/
  routes.ts
  schemas.ts
  applications.service.ts
  status-transitions.ts
```

## Testing

Unit: `assertTransition` matrix (allow/deny cases above).

Integration:

- CRUD + `201`/`204` shapes
- Unauth → 401
- Cross-user → 404
- Invalid body / empty PATCH → 400
- Transition deny → `INVALID_STATUS_TRANSITION`
- Create → `APPLICATION_CREATED` payload
- Status PATCH → `STATUS_CHANGED`
- Field PATCH → `FIELDS_UPDATED` (no status key)
- Combined PATCH → both activity types
- List: `q`, status, workplaceType, sort priority, pagination
- Create with non-default status allowed (no transition error)

## Success criteria

1. Migration: enums + `Application` + `Activity`.
2. Endpoints + ownership + transitions + activities work.
3. FE list/create/detail/timeline usable.
4. lint / typecheck / test / build / CI green.
5. README: apps section + endpoint list + transition rules summary.

## Non-goals (Phase 2)

Kanban, interviews, reminders/BullMQ/Redis app usage, dashboard analytics, file uploads, contacts table, activity pagination UI, email, AI.

## Self-review changelog (this pass)

| Issue                                      | Fix                                                 |
| ------------------------------------------ | --------------------------------------------------- |
| `employmentType` vs on-site/remote missing | Added `workplaceType`                               |
| Transition rules prose-only                | Added from/to matrix                                |
| Activity payload duplicated `type`         | Type = column only; payloads cleaned                |
| Create + custom status unclear             | Allowed; no transition check; only CREATED activity |
| String/URL/email limits missing            | Pinned max lengths + URL/email rules                |
| Date-only vs DateTime                      | Accept both; store UTC                              |
| Priority sort ambiguous                    | Explicit LOW<MEDIUM<HIGH                            |
| List filters incomplete                    | Added employmentType, workplaceType, priority       |
| HTTP success codes vague                   | 201 / 204 / envelope shapes pinned                  |
| Activities unbounded                       | Soft cap 200 newest                                 |
| FE nav / login redirect                    | Dashboard stays; nav links added                    |
| Clearing optional fields                   | `null` clears; omit unchanged                       |

## Residual thin (OK for implementation plan)

- Exact Prisma JSON type (`Json` vs `JsonB`)
- Exact FE component file split
- Whether list `company` param stays when `q` also exists (both kept; independent)

## Implementation principle

Inspect Phase 1 patterns first. Small coherent commits/PRs. Spec wins; document deviations in README.

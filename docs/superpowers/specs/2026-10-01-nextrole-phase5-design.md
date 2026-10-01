# NextRole — Phase 5 Design (Dashboard analytics)

**Date:** 2026-10-01  
**Status:** Approved — plan at `docs/superpowers/plans/2026-10-01-nextrole-phase5.md`  
**Path:** `~/Git/Me/NextRole`  
**Depends on:** Phase 2 applications; Phase 4 interviews; Soft Chromatic UI on `main`

## Goal

Ship **real dashboard analytics** on `/dashboard`: status totals, active pipeline, offer/rejection rates, interview upcoming/completed counts, and a 6-month applications-created series — all from live DB rows. Soft Chromatic presentation with light CSS/SVG charts. Keep recent applications list.

Stop before BullMQ/reminders, avg days-in-status, priority/interview-type mix charts, and a separate analytics route.

## Decisions (locked)

| Topic            | Choice                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Metrics bundle   | **B — Lean + time**                                                                             |
| Presentation     | Soft Chromatic surfaces + **light charts** (CSS/SVG bars; **no** chart library)                 |
| API              | Single **`GET /api/dashboard/stats`**                                                           |
| Auth             | `authGuard`; read-only (CSRF not required for GET)                                              |
| Ownership        | All aggregates scoped to `userId` of authenticated user                                         |
| Fake data        | **Forbidden** — empty account → zeros + empty-state copy                                        |
| Offer rate       | `OFFER / max(1, OFFER + REJECTED + WITHDRAWN)`                                                  |
| Rejection rate   | `REJECTED / same denominator`                                                                   |
| Active pipeline  | Applications whose status ∉ `{OFFER, REJECTED, WITHDRAWN}`                                      |
| Status breakdown | Count per `ApplicationStatus` (all eight keys always present, `0` if none)                      |
| Monthly series   | Last **6** calendar months UTC by `Application.createdAt`; include months with `0`              |
| Interviews       | `upcoming` = `SCHEDULED` and `scheduledAt >= now`; `completed` = status `COMPLETED` (all time)  |
| Recent list      | Keep existing client fetch of 5 apps — **not** embedded in stats payload                        |
| Module           | New `apps/api/src/modules/dashboard/`                                                           |
| Non-goals        | BullMQ, reminders, days-in-status, priority mix, interview-type mix, `/analytics` page, caching |

### Recent list

Keep **existing** TanStack Query to `GET /api/applications?pageSize=5&…` on the dashboard. Stats endpoint does **not** embed recent items (avoids duplicating list envelope).

## Architecture

```text
Browser /dashboard
  │  GET /api/dashboard/stats
  │  GET /api/applications?pageSize=5 (unchanged)
  ▼
apps/api/src/modules/dashboard/
  routes.ts  schemas.ts (response Zod)  dashboard.service.ts
  │  Prisma groupBy / count / raw month buckets scoped by userId
  ▼
PostgreSQL Application + Interview
```

Register from `app.ts` with prefix `/api/dashboard`. Soft Chromatic FE: extend [`DashboardPage.tsx`](apps/web/src/pages/DashboardPage.tsx); small presentational chart components under `apps/web/src/components/dashboard/`.

## API contract

### `GET /api/dashboard/stats`

**Auth:** required. **200** body:

```ts
{
  totals: {
    applications: number; // all apps for user
    activePipeline: number;
  }
  byStatus: Record<ApplicationStatus, number>; // all 8 keys
  rates: {
    offerRate: number; // 0..1 — raw float OK; no forced round/truncate on API
    rejectionRate: number; // 0..1 — same
    terminalCount: number; // OFFER+REJECTED+WITHDRAWN (denominator before max(1,…))
  }
  interviews: {
    upcoming: number;
    completed: number;
  }
  monthlyCreated: Array<{
    month: string; // "YYYY-MM" UTC
    count: number;
  }>; // length exactly 6, oldest → newest
}
```

**Errors:** unauthenticated → existing auth **401** pattern. No 404 for empty data.

### Rate edge cases

| Case                                       | Behavior                                |
| ------------------------------------------ | --------------------------------------- |
| `terminalCount === 0`                      | `offerRate` and `rejectionRate` = `0`   |
| Only offers / only rejects among terminals | Rates as formula; other rate may be `0` |
| WITHDRAWN in denominator                   | Yes                                     |

Rates returned as JSON numbers in `[0, 1]` (raw floats — no API round/truncate). FE formats as percent via `Math.round(rate * 100)` (e.g. `12%`).

### Monthly series construction

1. Let `now` = server UTC now.
2. Build months: current UTC month and 5 preceding (`YYYY-MM`).
3. Count applications where `userId` matches and `createdAt` falls in each month (UTC bounds).
4. Emit array length 6, oldest first; missing months → `count: 0`.

Prefer Prisma `groupBy` / `$queryRaw` with `date_trunc('month', "createdAt" AT TIME ZONE 'UTC')` — implementation may choose either if tests pin the contract.

### Interview counts

- `upcoming`: `Interview` joined via `Application.userId`, `status = SCHEDULED`, `scheduledAt >= now`.
- `completed`: same join, `status = COMPLETED` (no date filter).

Do **not** count `CANCELLED` / `NO_SHOW` in these two fields.

**Overdue scheduled:** `status = SCHEDULED` ∧ `scheduledAt < now` counts in **neither** `upcoming` nor `completed` (intentional — Phase 5 has no overdue bucket).

## Frontend

### Layout (`/dashboard`)

Soft Chromatic `AppShell` + `PageHeader` (existing greeting). Sections in order:

1. **Summary strip** — total applications, active pipeline, offer rate %, rejection rate % (`Surface` / big number tiles).
2. **By status** — horizontal or wrapped chips/bars using existing `STATUS_SURFACE` / `statusLabel` (counts).
3. **Monthly created** — one bar chart (CSS flex/grid or SVG): 6 bars, pastel purple accent fill, month labels, `aria` description / table fallback for a11y.
4. **Interviews** — upcoming + completed counts (`InterviewCounts` tiles/chips).
5. **Recent applications** — existing list (unchanged behavior).

Empty account: show zeros and short copy (“No applications yet”) on chart + recent; still render structure.

### Charts (light)

- **No** Recharts/Chart.js/etc.
- Prefer accessible pattern: visually bars + visually hidden or adjacent text summary (`aria-label` on figure + list of month/count).
- Respect `prefers-reduced-motion` (no animated bar growth required; static OK).

### Labels

Use [`apps/web/src/lib/labels.ts`](apps/web/src/lib/labels.ts) for status labels. Rate display: integer percent rounded (`Math.round(rate * 100)`).

## Testing

### API (Vitest)

- Unauthenticated → **401**.
- User with no apps → all zeros, 6 months, rates `0`.
- Seed apps across statuses → `byStatus` + totals + activePipeline correct.
- Terminal mix → offer/rejection rates match formula.
- Monthly: apps with controlled `createdAt` → series counts; other months `0`.
- Interviews upcoming vs completed filters.
- CANCELLED / NO_SHOW / overdue SCHEDULED → inflate neither upcoming nor completed.
- Cross-user isolation: other user’s apps never appear in counts.

### Web

- Pure helpers if any (e.g. percent format, month label) unit-tested.
- Manual/browser smoke: empty vs seeded dashboard; Soft Chromatic layout.

## Docs / gate

- README Phase 5 section: endpoint, formulas, chart note.
- `PROJECT_CONTEXT`: Phase 5 done-on-branch / next = reminders.
- Gate: `lint` + `typecheck` + `test` + `test -w apps/web` + `build`.

## Acceptance checklist

1. `GET /api/dashboard/stats` auth-scoped; contract matches above.
2. Rates and monthly series formulas pinned; no fake numbers.
3. Dashboard shows summary, by-status, monthly chart, interview counts, recent list.
4. Soft Chromatic + a11y for chart (text alternative).
5. README + PROJECT_CONTEXT updated; gate green.

## Non-goals (Phase 5)

Reminders/BullMQ, avg time-in-status, priority or interview-type breakdowns, date-range picker, export, caching/materialized views, separate `/analytics` route, chart libraries.

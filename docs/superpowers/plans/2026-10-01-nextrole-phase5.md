# NextRole Phase 5 Dashboard Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real `/api/dashboard/stats` aggregates and Soft Chromatic dashboard UI (summary, by-status, 6-month CSS/SVG chart, interview counts) per Phase 5 design.

**Architecture:** New Fastify module `modules/dashboard` with one GET. Service runs user-scoped Prisma counts/groupBy (+ month buckets). Web: `DashboardPage` consumes stats + existing recent list; light chart component without chart libs.

**Tech Stack:** Existing monorepo — Fastify, Prisma, Zod, Vitest, React, Vite, TanStack Query, Tailwind. **No new runtime deps.**

**Spec:** `docs/superpowers/specs/2026-10-01-nextrole-phase5-design.md` (binding).

## Subagent notes

- Workdir: isolated worktree under `/Users/aniisabihi/Git/Me/NextRole` via `using-git-worktrees`; branch `feat/phase-5-dashboard-analytics` from `origin/main`
- **Worktree bootstrap (before Task 1):**

```bash
cp /Users/aniisabihi/Git/Me/NextRole/apps/api/.env apps/api/.env   # from main checkout if missing
npm ci
npm exec -w apps/api -- prisma generate
```

- No schema migrate needed (Phase 5 is read-only aggregates). Tests share Postgres via `DATABASE_URL`; use existing `resetDb` / cascade clean patterns from other API tests so rows do not leak across files.
- Patterns: `registerAndLogin` from `tests/helpers/applications.ts`, `TEST_ORIGIN`, `authGuard`, `AppError`
- **Response Zod:** define `dashboardStatsSchema` in `schemas.ts` for **test assertions** (and optional docs). Routes return service object directly — do **not** add response-parse middleware (matches applications/interviews: request Zod only). FE may optionally mirror type; no runtime Zod on FE required.
- Spec wins on conflict; document deviations in README
- Never commit `.env`
- No BullMQ / reminders / chart libraries / fake numbers
- Gate: `lint` + `typecheck` + `test` + `test -w apps/web` + `build`

## Global Constraints

- All queries filter `Application.userId` (interviews via application relation)
- Empty user → zeros + 6-month series of zeros; rates `0` when `terminalCount === 0`
- Offer rate = `OFFER / max(1, OFFER+REJECTED+WITHDRAWN)`; rejection = `REJECTED / same`
- Rates: raw JSON floats in `[0, 1]` — no API round/truncate; FE `Math.round(rate * 100)`
- Active pipeline = not in `{OFFER,REJECTED,WITHDRAWN}`
- `byStatus` always includes all 8 `ApplicationStatus` keys — fill from local const mirroring Prisma enum:

```ts
const APPLICATION_STATUSES = [
  "SAVED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;
```

- `monthlyCreated` length **exactly 6**, oldest→newest, UTC `YYYY-MM`
- Interviews: `upcoming` = SCHEDULED ∧ scheduledAt≥now; `completed` = COMPLETED all-time
- Overdue SCHEDULED (`scheduledAt < now`) → **neither** bucket; CANCELLED / NO_SHOW → neither
- Recent apps: **existing** list query on FE — not in stats payload
- Charts: CSS/SVG only; text alternative for a11y; respect `prefers-reduced-motion` (static bars OK)
- Soft Chromatic tokens/labels (`statusLabel`, `STATUS_SURFACE`, accent purple)

---

## File map

```text
apps/api/src/modules/dashboard/
  dashboard.service.ts
  schemas.ts              # dashboardStatsSchema for tests
  routes.ts
apps/api/src/app.ts
apps/api/tests/dashboard/dashboard.stats.test.ts
apps/api/tests/helpers/dashboard.ts   # seedApp / seedInterview with createdAt override
apps/web/src/lib/types.ts             # DashboardStats type
apps/web/src/lib/dashboard-format.ts (+test)
apps/web/src/components/dashboard/
  StatTiles.tsx
  StatusBreakdown.tsx
  MonthlyCreatedChart.tsx
  InterviewCounts.tsx
apps/web/src/pages/DashboardPage.tsx
README.md
docs/PROJECT_CONTEXT.md
```

---

### Task 1: Dashboard service + HTTP GET

**Files:**

- Create: `apps/api/src/modules/dashboard/dashboard.service.ts`
- Create: `apps/api/src/modules/dashboard/schemas.ts`
- Create: `apps/api/src/modules/dashboard/routes.ts`
- Create: `apps/api/tests/helpers/dashboard.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/dashboard/dashboard.stats.test.ts`

**Interfaces:**

- Produces: `getDashboardStats(userId: string): Promise<DashboardStats>`
- Produces: `GET /api/dashboard/stats` → flat `DashboardStats` body (spec shape; no `{ data: … }` wrap)
- Consumes: `authGuard`, Prisma `application` / `interview`

- [ ] **Step 1: Seed helpers with `createdAt` override**

```ts
// apps/api/tests/helpers/dashboard.ts
import { prisma } from "../../src/db/prisma.js";
import type {
  ApplicationStatus,
  InterviewStatus,
  InterviewType,
} from "@prisma/client";

export async function seedApplication(opts: {
  userId: string;
  status?: ApplicationStatus;
  createdAt?: Date;
  company?: string;
  title?: string;
}) {
  return prisma.application.create({
    data: {
      userId: opts.userId,
      company: opts.company ?? "Acme",
      title: opts.title ?? "Engineer",
      status: opts.status ?? "APPLIED",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

export async function seedInterview(opts: {
  applicationId: string;
  status?: InterviewStatus;
  scheduledAt: Date;
  type?: InterviewType;
}) {
  return prisma.interview.create({
    data: {
      applicationId: opts.applicationId,
      type: opts.type ?? "VIDEO",
      status: opts.status ?? "SCHEDULED",
      scheduledAt: opts.scheduledAt,
    },
  });
}
```

Prisma allows overriding `@default(now())` on create — required for month-bucket tests.

- [ ] **Step 2: Write failing HTTP tests**

Cover at least:

1. Unauthenticated GET → **401**
2. Empty user → zeros, `monthlyCreated.length === 6`, rates `0`
3. Mixed statuses → `byStatus` (all 8 keys), `totals`, `activePipeline`
4. Terminals → offer/rejection rates (hand-check formula); assert `terminalCount`
5. Monthly buckets via `seedApplication({ createdAt: new Date("2026-05-15T12:00:00.000Z") })` etc.
6. Interview upcoming vs completed
7. CANCELLED + NO_SHOW + overdue SCHEDULED → inflate **neither** upcoming nor completed
8. Other user’s data excluded

```ts
const session = await registerAndLogin(app);

await app.inject({
  method: "GET",
  url: "/api/dashboard/stats",
  headers: { Cookie: session.cookieHeader },
});

// 401 case — no Cookie
await app.inject({ method: "GET", url: "/api/dashboard/stats" });
```

Assert body with `dashboardStatsSchema.parse(res.json())` (or equivalent).

- [ ] **Step 3: Run tests — expect fail (404 / missing module)**

```bash
cd apps/api && npx vitest run tests/dashboard/dashboard.stats.test.ts
```

- [ ] **Step 4: Implement service**

```ts
// Pseudocode — pin formulas in code comments matching spec
export async function getDashboardStats(userId: string) {
  const apps = await prisma.application.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });
  // fill byStatus for all APPLICATION_STATUSES (local const above)
  // totals.applications = sum
  // activePipeline = sum where status not terminal
  // rates from OFFER/REJECTED/WITHDRAWN; raw floats; 0 when terminalCount===0
  // monthlyCreated: 6 months UTC via $queryRaw or in-memory from findMany createdAt
  // interviews:
  //   upcoming: SCHEDULED && scheduledAt >= now
  //   completed: COMPLETED
  //   exclude CANCELLED, NO_SHOW, overdue SCHEDULED from both
}
```

Prefer `$queryRaw` for month buckets if cleaner; otherwise fetch `createdAt` list for user (OK for portfolio scale) and bucket in JS.

- [ ] **Step 5: Wire routes + register**

```ts
// routes.ts
app.get("/stats", { preHandler: [authGuard] }, async (req) => {
  return getDashboardStats(req.user!.id);
});
```

```ts
// app.ts
await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
```

- [ ] **Step 6: Run tests — expect pass**

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/dashboard apps/api/src/app.ts apps/api/tests/dashboard apps/api/tests/helpers/dashboard.ts
git commit -m "feat(api): add GET /api/dashboard/stats aggregates"
```

---

### Task 2: Web types + format helpers

**Files:**

- Modify: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/lib/dashboard-format.ts`
- Test: `apps/web/src/lib/dashboard-format.test.ts`

**Interfaces:**

- Produces: `export type DashboardStats = { ... }` matching API
- Produces: `formatRatePercent(rate: number): string` → `"12%"` via `Math.round(rate * 100)`

- [ ] **Step 1: Write failing tests for `formatRatePercent`**

```ts
expect(formatRatePercent(0)).toBe("0%");
expect(formatRatePercent(0.125)).toBe("13%");
expect(formatRatePercent(1)).toBe("100%");
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test -w apps/web -- src/lib/dashboard-format.test.ts
```

- [ ] **Step 3: Implement `DashboardStats` type + `formatRatePercent`**

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/dashboard-format.ts apps/web/src/lib/dashboard-format.test.ts
git commit -m "feat(web): add DashboardStats type and rate formatter"
```

---

### Task 3: Dashboard UI components + page

**Files:**

- Create: `apps/web/src/components/dashboard/StatTiles.tsx`
- Create: `apps/web/src/components/dashboard/StatusBreakdown.tsx`
- Create: `apps/web/src/components/dashboard/MonthlyCreatedChart.tsx`
- Create: `apps/web/src/components/dashboard/InterviewCounts.tsx`
- Modify: `apps/web/src/pages/DashboardPage.tsx`

**Interfaces:**

- Consumes: `DashboardStats`, `formatRatePercent`, `statusLabel`, `STATUS_SURFACE`
- Produces: Soft Chromatic dashboard sections per spec order:
  1. StatTiles → 2. StatusBreakdown → 3. MonthlyCreatedChart → 4. InterviewCounts → 5. recent list

- [ ] **Step 1: `StatTiles`** — total apps, active pipeline, offer %, rejection %

- [ ] **Step 2: `StatusBreakdown`** — map `byStatus` with pastel chips/counts

- [ ] **Step 3: `MonthlyCreatedChart`**

```tsx
// figure + CSS bars; max scale = max(count,1)
// aria-label summarizing series; ol/ul of "YYYY-MM: n" for SR
// no animated bar growth when prefers-reduced-motion (static OK always)
```

- [ ] **Step 4: `InterviewCounts`** — upcoming + completed tiles/chips (spec layout §4)

- [ ] **Step 5: Wire `DashboardPage`**

```ts
const stats = useQuery({
  queryKey: ["dashboard-stats"],
  queryFn: () => apiClient<DashboardStats>("/api/dashboard/stats"),
  enabled: me.isSuccess,
});
// keep existing recent query
```

Loading/error states Soft Chromatic. Empty copy when `totals.applications === 0`.

- [ ] **Step 6: Lint + typecheck + web tests**

```bash
npm run lint -w apps/web && npm run typecheck -w apps/web && npm run test -w apps/web
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/dashboard apps/web/src/pages/DashboardPage.tsx
git commit -m "feat(web): Soft Chromatic dashboard analytics UI"
```

---

### Task 4: Docs + gate

**Files:**

- Modify: `README.md`
- Modify: `docs/PROJECT_CONTEXT.md`

- [ ] **Step 1: README** — Phase 5 section: endpoint, formulas, chart note, empty-state rule, overdue-SCHEDULED note

- [ ] **Step 2: PROJECT_CONTEXT** — Phase 5 done-on-branch / next = reminders

- [ ] **Step 3: Full gate**

```bash
npm run lint && npm run typecheck && npm run test && npm run test -w apps/web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/PROJECT_CONTEXT.md
git commit -m "docs: add Phase 5 dashboard analytics notes"
```

---

## Manual smoke

1. Empty user: dashboard zeros + empty recent; no NaN rates
2. Create apps / interviews: counts and chart update after refresh
3. Overdue SCHEDULED interview: not in upcoming or completed
4. Second user: isolation
5. Chart keyboard/SR: month summary reachable

## Done when

Spec acceptance checklist satisfied; gate green; ready for PR review.

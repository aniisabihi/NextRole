# NextRole Phase 4 Interviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship nested interview CRUD under applications (detail-page UI, one-way status, activity timeline, a11y bar) per Phase 4 design.

**Architecture:** New `modules/interviews` Fastify plugin at `/api/applications/:applicationId/interviews`. Prisma `Interview` + `ActivityType` additions. Shared field-diff helper extracted from applications. Web: helpers + Interviews section on `ApplicationDetailPage` above Timeline.

**Tech Stack:** Existing monorepo — Fastify, Prisma, Zod, Vitest, React, Vite, TanStack Query, Tailwind. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-10-01-nextrole-phase4-design.md` (binding).

## Subagent notes

- Workdir: isolated worktree under `/Users/aniisabihi/Git/Me/NextRole` via `using-git-worktrees`; branch `feat/phase-4-interviews` from `origin/main`
- **Worktree bootstrap (before Task 1):**

```bash
cp /Users/aniisabihi/Git/Me/NextRole/apps/api/.env apps/api/.env   # from main checkout if missing
npm ci
npm exec -w apps/api -- prisma generate
```

- `prisma migrate dev` uses the same Postgres as main checkout (`DATABASE_URL` in `.env`) — fine for local; tests use `resetDb` cascade (Interview cascades with Application)
- After schema change: `npm exec -w apps/api -- prisma generate`
- Patterns: `registerAndLogin`, `TEST_ORIGIN` + CSRF (`tests/helpers/http.ts`), `getApplication`, `parseBody` / `parseQuery` from `shared/validation/parse.js` (**never** `schema.parse` in routes — Zod must become `400 VALIDATION_ERROR`), `AppError(code, statusCode, message)`, global CSRF/Origin
- Spec wins on conflict; document deviations in README
- Never commit `.env`
- No board/calendar/reminders/analytics
- HTTP mutation tests: `Origin: TEST_ORIGIN`, `Cookie`, `X-CSRF-Token`
- FE mutations: `apiClient(..., { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(...) })`; DELETE omits body; `apiClient` already handles 204
- Query keys: `["application-interviews", applicationId]`, `["application-activities", applicationId]` — do **not** invalidate `["applications"]` / `["application", id]`
- Fresh subagent: code below is authoritative

## Global Constraints

- Ownership via parent application `userId`; wrong owner / missing / wrong-app interview → `404`
- Mutations: CSRF + Origin global; `authGuard` per route; body via `parseBody`
- One-way status: `SCHEDULED` → `{COMPLETED,CANCELLED,NO_SHOW}` only
- Terminal: only `interviewer` | `locationOrUrl` | `notes` editable; locked fields → `INTERVIEW_TERMINAL_FIELDS_LOCKED`
- `scheduledAt`: ISO with **offset** required; compare patches using **epoch minutes** after `new Date(...)`
- Cap **50** interviews per application; count **inside** create `$transaction`
- Activities in same `$transaction` as mutation; payloads per spec (`interviewType` in payload)
- Dual PATCH → both `INTERVIEW_STATUS_CHANGED` + `INTERVIEW_UPDATED` (order of the two rows not asserted — same `createdAt` possible)
- DELETE → `204` empty; use `deleteMany` + count check
- Concurrent status: **last-write-wins** (Phase 3 style); rare terminal→terminal race accepted — note in README residual
- No `Application.updatedAt` bump; no application status coupling
- FE Upcoming = `status===SCHEDULED && scheduledAt >= now`; else Past
- Gate: `lint` + `typecheck` + `test` + `test -w apps/web` + `build`

---

## File map

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/**/add_interviews/**
apps/api/src/modules/activities/field-diff.ts
apps/api/src/modules/applications/applications.service.ts
apps/api/src/modules/interviews/
  interview-status-transitions.ts
  schemas.ts
  interviews.service.ts
  routes.ts
apps/api/src/app.ts
apps/api/tests/helpers/interviews.ts
apps/api/tests/interviews/
  interview-status-transitions.test.ts
  interviews.crud.test.ts
apps/web/src/lib/types.ts
apps/web/src/lib/interview-status-transitions.ts (+test)
apps/web/src/lib/interview-datetime.ts (+test)
apps/web/src/lib/interview-url.ts (+test)
apps/web/src/lib/interview-patch.ts (+test)
apps/web/src/lib/interview-group.ts (+test)
apps/web/src/lib/interview-activity.ts (+test)
apps/web/src/components/interviews/InterviewsSection.tsx
apps/web/src/pages/ApplicationDetailPage.tsx
README.md
docs/PROJECT_CONTEXT.md
```

---

### Task 1: Prisma Interview + ActivityType migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: migration `add_interviews`

**Interfaces:**

- Produces: enums `InterviewType`, `InterviewStatus`; model `Interview`; ActivityType `INTERVIEW_*`; `Application.interviews`

- [ ] **Step 1: Schema** — exact model/enums from spec; append four values to existing `ActivityType` enum; `interviews Interview[]` on Application.

- [ ] **Step 2: Migrate** (from worktree after bootstrap)

```bash
npm exec -w apps/api -- prisma migrate dev --name add_interviews
npm exec -w apps/api -- prisma generate
```

If non-interactive CI-like shell: ensure `DATABASE_URL` set. Migration should only DDL (`CREATE TYPE` / `ALTER TYPE … ADD VALUE` / `CREATE TABLE`) — **no** DML inserting activities. Four `ActivityType` values append to existing enum.

- [ ] **Step 3: Smoke** — `npm run typecheck -w apps/api` (or workspace typecheck). `resetDb` needs no change (Application cascade deletes interviews).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat: add Interview model and interview activity types"
```

---

### Task 2: Extract field-diff helper

**Files:**

- Create: `apps/api/src/modules/activities/field-diff.ts`
- Modify: `apps/api/src/modules/applications/applications.service.ts`

**Interfaces:**

```ts
export type FieldDiff = Record<string, { from: unknown; to: unknown }>;
export function valuesEqual(a: unknown, b: unknown): boolean;
export function serializeDiffValue(value: unknown): unknown;
```

(`valuesEqual` already handles `Date`↔`Date` by `getTime()`.)

- [ ] **Step 1:** Move verbatim from applications.service; update imports.

- [ ] **Step 2:** `npm run test -w apps/api` — green.

- [ ] **Step 3:** Commit `refactor: extract activity field-diff helpers`

---

### Task 3: Interview status transitions (API)

**Files:**

- Create: `apps/api/src/modules/interviews/interview-status-transitions.ts`
- Test: `apps/api/tests/interviews/interview-status-transitions.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  assertInterviewTransition,
  canTransitionInterviewStatus,
} from "../../src/modules/interviews/interview-status-transitions.js";
import { AppError } from "../../src/shared/errors/app-error.js";

describe("canTransitionInterviewStatus", () => {
  it("allows same status", () => {
    expect(canTransitionInterviewStatus("COMPLETED", "COMPLETED")).toBe(true);
  });
  it("allows SCHEDULED to terminals", () => {
    for (const to of ["COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      expect(canTransitionInterviewStatus("SCHEDULED", to)).toBe(true);
    }
  });
  it("rejects reopen and terminal→terminal", () => {
    expect(canTransitionInterviewStatus("COMPLETED", "SCHEDULED")).toBe(false);
    expect(canTransitionInterviewStatus("CANCELLED", "NO_SHOW")).toBe(false);
    expect(canTransitionInterviewStatus("NO_SHOW", "COMPLETED")).toBe(false);
  });
});

describe("assertInterviewTransition", () => {
  it("throws INVALID_INTERVIEW_STATUS_TRANSITION", () => {
    expect(() => assertInterviewTransition("COMPLETED", "SCHEDULED")).toThrow(
      AppError,
    );
    try {
      assertInterviewTransition("COMPLETED", "SCHEDULED");
    } catch (e) {
      expect(e).toMatchObject({
        code: "INVALID_INTERVIEW_STATUS_TRANSITION",
        statusCode: 400,
      });
    }
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { InterviewStatus } from "@prisma/client";
import { AppError } from "../../shared/errors/app-error.js";

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

- [ ] **Step 3:** `npm exec -w apps/api -- vitest run tests/interviews/interview-status-transitions.test.ts` — PASS

- [ ] **Step 4:** Commit `feat: add interview status transition helpers`

---

### Task 4: Schemas + create/list + routes + test helpers

**Files:**

- Create: `schemas.ts`, `interviews.service.ts` (create/list), `routes.ts` (GET/POST)
- Create: `apps/api/tests/helpers/interviews.ts`
- Modify: `app.ts`
- Test: `interviews.crud.test.ts`

**Interfaces:**

- Produces: `listInterviews`, `createInterview`, HTTP GET/POST
- Consumes: `getApplication`, `parseBody`

- [ ] **Step 1: Test helpers**

```ts
// apps/api/tests/helpers/interviews.ts
import { expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { TEST_ORIGIN } from "./http.js";
import { registerAndLogin } from "./applications.js";

export async function loginSession(app: FastifyInstance) {
  return registerAndLogin(app);
}

export function mutHeaders(
  session: Awaited<ReturnType<typeof registerAndLogin>>,
) {
  return {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
    "X-CSRF-Token": session.cookies.csrf_token!,
    "Content-Type": "application/json",
  };
}

export async function createApplicationFor(
  app: FastifyInstance,
  session: Awaited<ReturnType<typeof registerAndLogin>>,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/applications",
    headers: mutHeaders(session),
    payload: {
      company: "Co",
      title: "Role",
      employmentType: "FULL_TIME",
      workplaceType: "REMOTE",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().application as { id: string };
}

export function isoOffset(minutesFromNow = 60) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}
```

- [ ] **Step 2: Failing tests (create/list)** in `interviews.crud.test.ts`:

```ts
it("POST 201 + INTERVIEW_CREATED payload snapshot", async () => {});
it("strips status on create → still SCHEDULED", async () => {
  // payload includes status: "COMPLETED" → 201, interview.status === "SCHEDULED"
});
it("OTHER without typeLabel → 400", async () => {});
it("OTHER with whitespace typeLabel → 400", async () => {});
it("offset-less scheduledAt → 400", async () => {
  // "2026-10-01T12:00:00" (no Z/offset)
});
it("date-only scheduledAt → 400", async () => {
  // "2026-10-01"
});
it("GET sorted by scheduledAt asc, id asc", async () => {});
it("cross-user GET → 404", async () => {});
it("unauthenticated GET → 401", async () => {});
it("missing CSRF on POST → 403", async () => {});
it("GET /api/applications/:id still 200 after interviews plugin registered", async () => {});
```

Expect fail (404 routes) before impl.

- [ ] **Step 3: Schemas**

```ts
import { InterviewStatus, InterviewType } from "@prisma/client";
import { z } from "zod";

function emptyToUndefined(value: unknown) {
  return value === "" ? undefined : value;
}

function trimmedMax(max: number) {
  return z.string().trim().max(max);
}

export const scheduledAtSchema = z
  .string()
  .datetime({ offset: true })
  .refine((s) => {
    const y = new Date(s).getUTCFullYear();
    return y >= 1 && y <= 9999;
  }, "scheduledAt year out of range");

const optionalNullableString = (max: number) =>
  z.preprocess(emptyToUndefined, trimmedMax(max).nullable().optional());

/**
 * typeLabel: do NOT emptyToUndefined — "" must reach service
 * so OTHER+"" → 400 even when prior label existed.
 */
const typeLabelField = z.union([z.string().max(100), z.null()]).optional();

export const createInterviewSchema = z.object({
  scheduledAt: scheduledAtSchema,
  type: z.nativeEnum(InterviewType),
  typeLabel: typeLabelField,
  interviewer: optionalNullableString(200),
  locationOrUrl: optionalNullableString(2000),
  notes: optionalNullableString(10000),
});

export const updateInterviewSchema = z
  .object({
    scheduledAt: scheduledAtSchema.optional(),
    type: z.nativeEnum(InterviewType).optional(),
    typeLabel: typeLabelField,
    status: z.nativeEnum(InterviewStatus).optional(),
    interviewer: optionalNullableString(200),
    locationOrUrl: optionalNullableString(2000),
    notes: optionalNullableString(10000),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

export type CreateInterviewBody = z.infer<typeof createInterviewSchema>;
export type UpdateInterviewBody = z.infer<typeof updateInterviewSchema>;
```

- [ ] **Step 4: Service create/list**

```ts
function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function resolveTypeLabel(
  type: InterviewType,
  typeLabel: string | null | undefined,
): string | null {
  if (type === "OTHER") {
    const label = typeof typeLabel === "string" ? typeLabel.trim() : "";
    if (!label) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "typeLabel is required when type is OTHER",
      );
    }
    return label.slice(0, 100);
  }
  return null;
}

function snapshotPayload(interview: Interview) {
  return {
    interviewId: interview.id,
    interviewType: interview.type,
    typeLabel: interview.typeLabel,
    status: interview.status,
    scheduledAt: interview.scheduledAt.toISOString(),
    interviewer: interview.interviewer,
    locationOrUrl: interview.locationOrUrl,
    notes: interview.notes,
  };
}
```

Create: inside `$transaction`, `count` then if `>= 50` throw `INTERVIEW_LIMIT_EXCEEDED`; else create + `INTERVIEW_CREATED` with full `snapshotPayload`.  
Normalize interviewer/location/notes with `normalizeOptionalString`.  
List: `getApplication` then `findMany` orderBy `[{ scheduledAt: "asc" }, { id: "asc" }]`.

- [ ] **Step 5: Routes** — `parseBody`, `request` naming:

```ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { parseBody } from "../../shared/validation/parse.js";
import * as interviewsService from "./interviews.service.js";
import { createInterviewSchema } from "./schemas.js";

export async function interviewsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    const { applicationId } = request.params as { applicationId: string };
    return interviewsService.listInterviews(userId, applicationId);
  });

  app.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const { applicationId } = request.params as { applicationId: string };
    const body = parseBody(createInterviewSchema, request.body);
    const interview = await interviewsService.createInterview(
      userId,
      applicationId,
      body,
    );
    return reply.status(201).send({ interview });
  });
}
```

```ts
// app.ts
import { interviewsRoutes } from "./modules/interviews/routes.js";
await app.register(interviewsRoutes, {
  prefix: "/api/applications/:applicationId/interviews",
});
```

- [ ] **Step 6:** Tests PASS for Task 4 cases.

- [ ] **Step 7:** Commit `feat: add interview create and list endpoints`

---

### Task 5: PATCH (typeLabel merge, terminal lock, status, dual activities)

**Files:**

- Modify: `interviews.service.ts`, `routes.ts`
- Test: extend `interviews.crud.test.ts`

**Interfaces:**

- Produces: `updateInterview(userId, applicationId, id, patch: UpdateInterviewBody)`
- Consumes: `assertInterviewTransition`, `valuesEqual`/`serializeDiffValue` (Dates after `new Date`)

- [ ] **Step 1: Failing tests**

```ts
it("PATCH status SCHEDULED→COMPLETED + STATUS_CHANGED activity", async () => {});
it("PATCH status+notes → both STATUS_CHANGED and UPDATED activities", async () => {
  // do not assert activity row order
});
it("reopen COMPLETED→SCHEDULED → 400 INVALID_INTERVIEW_STATUS_TRANSITION", async () => {});
it("terminal→terminal CANCELLED→NO_SHOW → 400", async () => {});
it("terminal + scheduledAt → 400 INTERVIEW_TERMINAL_FIELDS_LOCKED", async () => {});
it("terminal + notes ok", async () => {});
it('PATCH type OTHER with typeLabel:"" clearing prior label → 400', async () => {});
it("PATCH type PHONE from OTHER clears typeLabel in UPDATED diff", async () => {});
it("empty PATCH {} → 400", async () => {});
it("no-op PATCH same scheduledAt minute → 200 no new activity", async () => {
  // ISO differing only in seconds within same UTC minute
});
it("wrong-app interview id → 404", async () => {});
it("cross-user PATCH → 404", async () => {});
```

- [ ] **Step 2: `updateInterview` algorithm**

1. `getApplication`; load interview `{ id, applicationId }` else 404.
2. Presence: `patch.field !== undefined`.
3. If terminal (`existing.status !== "SCHEDULED"`):
   - if `patch.status !== undefined` && `patch.status !== existing.status` → `assertInterviewTransition` (fails)
   - if any of `scheduledAt`|`type`|`typeLabel` `!== undefined` → `INTERVIEW_TERMINAL_FIELDS_LOCKED` (even if same value)
4. Effective type = `patch.type ?? existing.type`.  
   Effective typeLabel = `patch.typeLabel !== undefined ? patch.typeLabel : existing.typeLabel`.  
   `nextTypeLabel = resolveTypeLabel(effectiveType, effectiveTypeLabel)`.
5. If `patch.status !== undefined`: `assertInterviewTransition(existing.status, patch.status)`.
6. Normalize optional strings.
7. **scheduledAt:** `nextScheduled = patch.scheduledAt !== undefined ? new Date(patch.scheduledAt) : existing.scheduledAt`; equal iff `Math.floor(a.getTime()/60000) === Math.floor(b.getTime()/60000)`.
8. FieldDiff for changed non-status fields; `serializeDiffValue`; payload `as Prisma.InputJsonValue`.
9. If no status change and empty fieldDiff → return existing.
10. `$transaction`: update; if status changed → STATUS_CHANGED `{ interviewId, from, to }`; if fieldDiff → UPDATED `{ interviewId, fields }`.

- [ ] **Step 3: Route**

```ts
app.patch("/:id", { preHandler: [authGuard] }, async (request) => {
  const userId = request.userId!;
  const { applicationId, id } = request.params as {
    applicationId: string;
    id: string;
  };
  const body = parseBody(updateInterviewSchema, request.body);
  const interview = await interviewsService.updateInterview(
    userId,
    applicationId,
    id,
    body,
  );
  return { interview };
});
```

- [ ] **Step 4:** Tests PASS.

- [ ] **Step 5:** Commit `feat: add interview update with status and field rules`

---

### Task 6: DELETE + cap + cascade

**Files:**

- Modify: service + routes
- Test: extend crud tests

- [ ] **Step 1: Failing tests**

```ts
it("DELETE 204 + INTERVIEW_DELETED snapshot + row gone", async () => {});
it("cross-user DELETE → 404", async () => {});
it("51st create → INTERVIEW_LIMIT_EXCEEDED", async () => {});
it("delete application cascades interviews", async () => {});
```

- [ ] **Step 2: deleteInterview**

```ts
await prisma.$transaction(async (tx) => {
  await tx.activity.create({
    data: {
      applicationId,
      userId,
      type: "INTERVIEW_DELETED",
      payload: snapshotPayload(existing),
    },
  });
  const result = await tx.interview.deleteMany({
    where: { id, applicationId },
  });
  if (result.count !== 1) {
    throw new AppError("NOT_FOUND", 404, "Interview not found");
  }
});
```

Route: `return reply.status(204).send();`

- [ ] **Step 3:** Tests PASS.

- [ ] **Step 4:** Commit `feat: add interview delete and enforce per-application cap`

---

### Task 7: Web types + helpers + tests

**Files:** `apps/web/src/lib/types.ts`, `interview-*.ts` (+tests)

- [ ] **Step 1: Types**

```ts
export const INTERVIEW_TYPES = [
  "PHONE",
  "VIDEO",
  "ONSITE",
  "TECHNICAL",
  "OTHER",
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_STATUSES = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export type Interview = {
  id: string;
  applicationId: string;
  scheduledAt: string;
  type: InterviewType;
  typeLabel: string | null;
  status: InterviewStatus;
  interviewer: string | null;
  locationOrUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InterviewListResponse = { items: Interview[] };
export type InterviewResponse = { interview: Interview };

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  PHONE: "Phone",
  VIDEO: "Video",
  ONSITE: "On-site",
  TECHNICAL: "Technical",
  OTHER: "Other",
};
export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

// Extend ACTIVITY_TYPES + payload unions per spec
```

- [ ] **Step 2: `canTransitionInterviewStatus`** — mirror API; full matrix tests.

- [ ] **Step 3: datetime**

```ts
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new RangeError("Invalid date");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): string {
  if (!value) throw new RangeError("Empty datetime-local");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new RangeError("Invalid datetime-local");
  return d.toISOString();
}

export function sameUtcMinute(aIso: string, bIso: string): boolean {
  return (
    Math.floor(new Date(aIso).getTime() / 60_000) ===
    Math.floor(new Date(bIso).getTime() / 60_000)
  );
}
```

Tests: prefer `TZ=UTC` via vitest config `env` or file-level set **before** imports; round-trip non-gap times only.

- [ ] **Step 4: `linkIfHttpUrl`** — https ok; `javascript:` null; plain text null.

- [ ] **Step 5: `buildInterviewPatch`**

```ts
export type InterviewFormState = {
  scheduledAtLocal: string;
  type: InterviewType;
  typeLabel: string;
  interviewer: string;
  locationOrUrl: string;
  notes: string;
};

export function buildInterviewPatch(
  server: Interview,
  form: InterviewFormState,
  opts: { terminal: boolean },
): Record<string, unknown> {
  // terminal: only interviewer, locationOrUrl, notes
  // scheduledAt via fromDatetimeLocal; include iff !sameUtcMinute
  // empty strings → null for clearable fields; omit unchanged; no status
}
```

- [ ] **Step 6: `groupInterviews`**

```ts
export function groupInterviews(
  items: Interview[],
  now: Date = new Date(),
): { upcoming: Interview[]; past: Interview[] } {
  const upcoming: Interview[] = [];
  const past: Interview[] = [];
  for (const i of items) {
    if (i.status === "SCHEDULED" && new Date(i.scheduledAt) >= now) {
      upcoming.push(i);
    } else {
      past.push(i);
    }
  }
  return { upcoming, past };
}
```

Test: past-dated SCHEDULED → past.

- [ ] **Step 7: `formatInterviewActivity(activity): string`** — four types; unit tests.

- [ ] **Step 8:** `npm test -w apps/web` PASS

- [ ] **Step 9:** Commit `feat: add web interview helpers and types`

---

### Task 8: InterviewsSection UI + timeline wiring

**Files:**

- Create: `apps/web/src/components/interviews/InterviewsSection.tsx`
- Modify: `ApplicationDetailPage.tsx` — `<InterviewsSection applicationId={id!} />` after `</form>`, before Timeline; ActivityItem uses formatters

**Why child component:** interview hooks stay out of detail-page early returns.

- [ ] **Step 1: ActivityItem** — four interview branches via `formatInterviewActivity`.

- [ ] **Step 2: InterviewsSection**

```tsx
export function InterviewsSection({
  applicationId,
}: {
  applicationId: string;
}) {
  // useQuery ["application-interviews", applicationId]
  // panel: closed | create | { edit: Interview }
  // mutationError role="alert"; successAnnounce role="status"
  // groupInterviews(items)
  // h2#interviews-heading tabIndex={-1}
}
```

Focus:

- Open create/edit → focus first field
- Save/cancel → focus Edit/Add
- Delete → focus `#interviews-heading`
- Status/delete: `window.confirm`
- Unique `aria-label`s; `focus-visible` styles
- Loading / empty / error+Retry
- `linkIfHttpUrl` → `<a target="_blank" rel="noopener noreferrer">`
- Invalidate interviews + activities only

- [ ] **Step 3:** Wire detail page.

- [ ] **Step 4:** Manual smoke (`npm run dev`).

- [ ] **Step 5:** Commit `feat: add interviews section on application detail`

---

### Task 9: Docs + gate

**Files:** `README.md`, `docs/PROJECT_CONTEXT.md`

- [ ] **Step 1: README** — endpoints, enums, one-way, terminal locks, offset datetime, cap 50, DELETE 204, concurrent LWW residual, checklist (incl. past-dated SCHEDULED in Past).

- [ ] **Step 2: PROJECT_CONTEXT** — Phase 3 on `main`; Phase 4 branch/merge; next = analytics.

- [ ] **Step 3: Gate**

```bash
npm run lint && npm run typecheck && npm run test && npm run test -w apps/web && npm run build
```

- [ ] **Step 4:** Commit `docs: add Phase 4 interviews README and context`

---

## Spec coverage

| Spec item                                      | Task      |
| ---------------------------------------------- | --------- |
| Schema + ActivityType                          | 1         |
| field-diff extract                             | 2         |
| One-way transitions                            | 3         |
| Create/list + datetime + OTHER + parseBody     | 4         |
| PATCH / dual activities / terminal / typeLabel | 5         |
| DELETE 204 / cap / cascade                     | 6         |
| Web helpers + group + activity format          | 7         |
| Detail UI + timeline                           | 8         |
| Docs + gate                                    | 9         |
| Non-goals                                      | respected |

## Plan self-review (SDD)

- Spec coverage complete after review fixes
- Routes use `parseBody` (400 not 500)
- typeLabel empty reaches service; OTHER+"" → 400
- scheduledAt compared as Date + epoch minutes
- Cap count inside transaction
- FE Upcoming = SCHEDULED && >= now; hooks in child component
- Worktree `.env` / `npm ci` documented
- Concurrent status LWW residual explicit
- DELETE `deleteMany`; assert via `toThrow`/`toMatchObject`
- Gate includes web tests

## Residual thin (OK)

- Exact Tailwind tokens
- `window.confirm` a11y limits
- Concurrent status race (documented)
- Activity soft-cap 200 on busy apps
- Optional TZ name beside display time

---

## Execution handoff

Plan: `docs/superpowers/plans/2026-10-01-nextrole-phase4.md`

**1. Subagent-Driven (recommended)** · **2. Inline Execution**

Which approach?

# NextRole — Project Context (handoff)

**Repo:** https://github.com/aniisabihi/NextRole (public)  
**Local path:** `~/Git/Me/NextRole`  
**Purpose of this file:** Resume work in a new chat without re-deriving Phase 1–3 decisions. Read this first, then the linked specs/plans.

---

## What the product is

Portfolio **Job Application Tracker** — production-quality full-stack demo emphasizing:

Node.js, TypeScript, REST APIs, PostgreSQL, authentication, background jobs, testing, Docker, CI/CD.

Users track job applications through a pipeline (company, title, status, notes, contacts, resume/CV version labels, interviews, reminders, dashboard stats, Kanban).

**Brand / folder name:** NextRole.

---

## Tech stack (locked)

| Layer        | Choice                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Monorepo     | npm workspaces: `apps/api`, `apps/web`                                                                            |
| API          | Node 22, Fastify, TypeScript strict, Zod, Prisma                                                                  |
| DB           | PostgreSQL 16 (Docker)                                                                                            |
| Jobs (later) | Redis + BullMQ (Redis in Compose now; **unused** until reminders phase)                                           |
| Auth         | Argon2id; JWT access + opaque refresh in httpOnly cookies; CSRF double-submit; refresh families + reuse detection |
| Web          | React, Vite, React Router, TanStack Query, Tailwind                                                               |
| Test / CI    | Vitest (API), GitHub Actions                                                                                      |
| Dev          | `npm run dev` → concurrently API `:3000` + web `:5173` (Vite proxies `/api`)                                      |

**Not used:** Next.js, Turborepo, pnpm, shared packages (YAGNI).

---

## Original product scope (full vision)

From the kickoff specification (condensed):

1. **Auth** — register/login/logout/profile; password hashing; per-user isolation
2. **Applications** — CRUD, search, filter, sort
3. **Kanban** — board by status; server-validated transitions
4. **Activity timeline** — persistent events (created, status changed, notes, …)
5. **Interviews** — schedule against an application
6. **Dashboard** — real stats from DB (counts, rates)
7. **Reminders** — BullMQ worker, follow-ups
8. **Resume/cover labels** — metadata strings first; file upload later

**Statuses:**  
`SAVED` → `APPLIED` → `SCREENING` → `INTERVIEW` → `TECHNICAL_INTERVIEW` → `OFFER` / `REJECTED` / `WITHDRAWN`

Build **incrementally**. Do not implement everything in one phase.

---

## Roadmap / phases

| Phase                              | Status                                     | Deliverable                                                                                   |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **1 — Auth foundation**            | **Done** (on `main`)                       | Cookie auth, CSRF, refresh rotation/reuse, login/register/dashboard shell, Docker, CI, README |
| **2 — Applications core**          | **Done** (on `main`, PR #2)                | CRUD, list/filter/sort, soft transitions, activities, FE list/create/detail                   |
| **3 — Kanban**                     | **Done** (on `main`, PR #3)                | `/board` DnD, `boardOrder`, reorder + bulk-status APIs, a11y checklist                        |
| **4 — Interviews**                 | **Done** (on `main`, PR #4)                | Interview CRUD nested under applications, one-way status, timeline, Upcoming/Past UI          |
| **UI — Soft Chromatic**            | **In progress** (`feat/ui-soft-chromatic`) | Full FE visual system: pastel status colors, Fraunces/Figtree, AppShell, all surfaces         |
| **5 — Dashboard analytics** (next) | Not started                                | Real aggregates only (no fake numbers)                                                        |
| **6 — Reminders / BullMQ**         | Not started                                | Worker process + Redis usage                                                                  |
| **Later**                          | —                                          | File uploads, `__Host-` cookies, session UI, email verify, etc.                               |

Phase numbers 3–6 are the intended order; adjust only with an explicit design pass.

---

## Phase 1 — completed

**Branch / commits:** merged to `main` (auth + CI fix + concurrent `dev`).

**Works:**

- Register / login / logout / `GET /api/me`
- Access + refresh httpOnly cookies; CSRF cookie + header; Origin checks
- Refresh rotation, reuse detection (family revoke), grace mint path
- Rate limits on auth routes
- Vite login/register/dashboard; `apiClient` single-flight refresh
- Postgres + Prisma; Redis container idle
- Vitest (~42 tests); CI green on `main`

**Docs:**

- Spec: `docs/superpowers/specs/2026-09-30-nextrole-phase1-design.md`
- Plan: `docs/superpowers/plans/2026-09-30-nextrole-phase1.md`

**Key auth decisions:** httpOnly cookies (not Bearer in localStorage); access+refresh; CSRF = double-submit + Origin; refresh rows in Postgres (not Redis); Argon2id; Vite `/api` proxy.

---

## Phase 2 — completed

**Merged:** PR [#2](https://github.com/aniisabihi/NextRole/pull/2) → `main` (`68e7068`).

**Scope locked (option A):** applications core only — **no** Kanban, interviews, BullMQ, or fake dashboard stats.

**Works:**

- Application CRUD + ownership isolation
- List: `q`, status/company/employment/workplace/priority filters, sort (incl. `priorityRank`), pagination
- Soft status transitions (`assertTransition`); activities timeline
- FE: `/applications`, `/applications/new`, `/applications/:id` + dashboard recent links
- Invalid/malformed dates → `400`; list pagination uses `id` tiebreaker; no-op PATCH preserves `updatedAt`
- Vitest API suite **76** tests (Phase 1+2)

**Extra field decision:** two dimensions —

- `employmentType`: FULL_TIME / PART_TIME / CONTRACT / INTERNSHIP / OTHER
- `workplaceType`: ON_SITE / HYBRID / REMOTE

**Status rules:** soft matrix (terminals cannot reopen to mid-pipeline except `WITHDRAWN` → `SAVED`|`APPLIED`).

**Activities:** `APPLICATION_CREATED`, `STATUS_CHANGED`, `FIELDS_UPDATED` (service side-effects only).

**Sort:** `priorityRank` int (LOW=1, MEDIUM=2, HIGH=3).

**Docs:**

- Spec: `docs/superpowers/specs/2026-09-30-nextrole-phase2-design.md` (**Approved**)
- Plan: `docs/superpowers/plans/2026-09-30-nextrole-phase2.md` (**Executed via SDD**)
- README Phase 2 section: endpoints, enums, transition matrix, employment vs workplace

---

## Phase 3 — Kanban (done; on `main`, PR #3)

**Scope:** `/board` only; no interviews, BullMQ, analytics, uploads.

**Works:**

- 8 status columns × priority swimlanes (HIGH → MEDIUM → LOW); `@dnd-kit` pointer + keyboard sensors; drag handle (card click → detail)
- `Application.boardOrder` (cell = userId, status, priority; migration backfill; append on create/move; delete leaves gaps); `priorityRank` unchanged
- `POST /api/applications/board/reorder` (exact full cell set, `{ ok: true }`); `POST /api/applications/board/bulk-status` (`{ moved, skipped }`; skip codes `NOT_FOUND`, `ALREADY_IN_STATUS`, `INVALID_STATUS_TRANSITION`); both registered before `/:id`
- List `pageSize` max raised to **100**; board loads one page, truncation banner when `total > 100`
- Web `canTransition` mirror (`apps/web/src/lib/status-transitions.ts`) + parity tests
- Multi-select (Cmd/Ctrl-click) → bulk status only; multi-drag to lane unsupported
- A11y: live region, focus restore, reduced motion, 44px targets; manual checklist in README

**Decisions:** no shared package for transitions; last-write-wins reorder; no touch multi-select / Shift-range in v1.

**Docs:**

- Spec: `docs/superpowers/specs/2026-10-01-nextrole-phase3-design.md`
- Plan: `docs/superpowers/plans/2026-10-01-nextrole-phase3.md`
- README Phase 3 section: endpoints, skip codes, board UX, manual a11y checklist

---

## Phase 4 — Interviews (done on `main`, PR #4)

**Scope:** interviews nested under applications; no reminders, BullMQ, analytics, uploads.

**Works:**

- `Interview` model: `scheduledAt`, `type` (`PHONE`/`VIDEO`/`ONSITE`/`TECHNICAL`/`OTHER`), `typeLabel` (required for `OTHER`), `status` (`SCHEDULED`/`COMPLETED`/`CANCELLED`/`NO_SHOW`), `interviewer`, `locationOrUrl`, `notes`
- `GET`/`POST /api/applications/:applicationId/interviews`, `PATCH`/`DELETE .../:id` (`DELETE` → `204`)
- `scheduledAt` = ISO datetime **with offset** required; compared at epoch-minute precision
- One-way status: `SCHEDULED` → terminal only; terminal locks `scheduledAt`/`type`/`typeLabel`
- Cap **50** per application (`INTERVIEW_LIMIT_EXCEEDED`); routes use `parseBody` (400 not 500)
- New `ActivityType`s: `INTERVIEW_CREATED|UPDATED|STATUS_CHANGED|DELETED`; shared field-diff helper extracted from applications
- FE: detail-page interviews section (Upcoming = `SCHEDULED` and `>= now`; Past otherwise incl. past-dated `SCHEDULED`), timeline formatting, web transition/patch/datetime/url helpers + tests

**Decisions / residual:** concurrent status change is last-write-wins (documented); no reminders; `window.confirm` for delete.

**Docs:**

- Spec: `docs/superpowers/specs/2026-10-01-nextrole-phase4-design.md`
- Plan: `docs/superpowers/plans/2026-10-01-nextrole-phase4.md`
- README Phase 4 section: endpoints, enums, terminal locks, manual checklist

---

## Phases left (next up)

1. **Soft Chromatic UI** — branch `feat/ui-soft-chromatic` (presentation-only redesign)
2. **Dashboard analytics (Phase 5)** — totals, monthly, rates from real rows
3. **Reminders + BullMQ worker** — independent worker process; Redis required
4. **Hardening / polish** — file uploads, `__Host-` cookies, session management UI, richer contacts

---

## Soft Chromatic UI

**Direction:** pastel status/priority chips, airy paper wash, Fraunces display + Figtree body, pastel purple accent, AppShell brand strip. Light mode only.

**Tokens:** `apps/web/src/index.css` (`@theme`), `apps/web/src/lib/statusColors.ts`, `apps/web/src/components/ui/*`, `AppShell`.

**Next session:** merge UI PR, then Phase 5 dashboard analytics design/plan. Reuse applications/interviews services; real aggregates only.

---

## How to run (local)

```bash
docker compose up -d   # or docker-compose up -d
cp .env.example apps/api/.env   # skip if apps/api/.env already set
npm install
npm exec -w apps/api -- prisma generate   # required after fresh install
npm run db:migrate
npm run dev            # API :3000 + web :5173 in parallel
```

Do **not** run `npm audit fix --force` — it breaks prisma/`@prisma/client` pairing.

Details: root `README.md`.

---

## Agent / session tips

- Next session: after Soft Chromatic UI merges, Phase 5 dashboard analytics design/plan. Reuse applications/interviews services; real aggregates only. Do not re-implement Phases 2–4.
- Prefer inspecting existing modules before inventing new patterns.
- Spec > plan > improvisation; document intentional deviations in README.
- Do not commit secrets (`.env`).
- Caveman communication may be active for this user; code/commits stay normal prose in commit messages.

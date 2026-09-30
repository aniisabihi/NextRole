# NextRole — Project Context (handoff)

**Repo:** https://github.com/aniisabihi/NextRole (public)  
**Local path:** `~/Git/Me/NextRole`  
**Purpose of this file:** Resume work in a new chat without re-deriving Phase 1–2 decisions. Read this first, then the linked specs/plans.

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

| Phase                       | Status                                 | Deliverable                                                                                   |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| **1 — Auth foundation**     | **Done** (on `main`)                   | Cookie auth, CSRF, refresh rotation/reuse, login/register/dashboard shell, Docker, CI, README |
| **2 — Applications core**   | **Spec + plan ready; not implemented** | CRUD, list/filter/sort, soft transitions, activities, FE list/create/detail                   |
| **3 — Kanban**              | Not started                            | Board UI + drag/move; reuse Phase 2 transition rules                                          |
| **4 — Interviews**          | Not started                            | Interview CRUD nested under applications                                                      |
| **5 — Dashboard analytics** | Not started                            | Real aggregates only (no fake numbers)                                                        |
| **6 — Reminders / BullMQ**  | Not started                            | Worker process + Redis usage                                                                  |
| **Later**                   | —                                      | File uploads, `__Host-` cookies, session UI, email verify, etc.                               |

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

## Phase 2 — next (ready to execute)

**Scope locked (option A):** applications core only — **no** Kanban, interviews, BullMQ, or fake dashboard stats.

**Extra field decision:** two dimensions —

- `employmentType`: FULL_TIME / PART_TIME / CONTRACT / INTERNSHIP / OTHER
- `workplaceType`: ON_SITE / HYBRID / REMOTE

**Status rules:** soft matrix (terminals cannot reopen to mid-pipeline except `WITHDRAWN` → `SAVED`|`APPLIED`).

**Activities:** `APPLICATION_CREATED`, `STATUS_CHANGED`, `FIELDS_UPDATED` (service side-effects only).

**Sort:** `priorityRank` int (LOW=1, MEDIUM=2, HIGH=3).

**Docs:**

- Spec: `docs/superpowers/specs/2026-09-30-nextrole-phase2-design.md` (**Approved**)
- Plan: `docs/superpowers/plans/2026-09-30-nextrole-phase2.md` (**Reviewed; ready for SDD**)

**Execution when starting a new session:**

1. Read this file + Phase 2 spec + Phase 2 plan
2. Use **subagent-driven-development** (user preference historically: option 1)
3. Branch `feat/phase-2-applications` from `main`
4. Implement plan tasks 1→7; do not expand scope

---

## Phases left (after Phase 2)

1. **Kanban** — board by status; move cards; server already validates transitions
2. **Interviews** — date/time, type, interviewer, location/URL, notes
3. **Dashboard analytics** — totals, monthly, rates from real rows
4. **Reminders + BullMQ worker** — independent worker process; Redis required
5. **Hardening / polish** — file uploads, `__Host-` cookies, session management UI, richer contacts

---

## How to run (local)

```bash
docker compose up -d   # or docker-compose up -d
cp .env.example apps/api/.env
npm install
npm run db:migrate
npm run dev            # API :3000 + web :5173 in parallel
```

Details: root `README.md`.

---

## Agent / session tips

- Caveman communication may be active for this user; code/commits stay normal prose in commit messages.
- Prefer inspecting existing modules before inventing new patterns.
- Spec > plan > improvisation; document intentional deviations in README.
- Do not commit secrets (`.env`).
- After Phase 2 implementation, update **this file** (mark Phase 2 done; point to commits/PR).

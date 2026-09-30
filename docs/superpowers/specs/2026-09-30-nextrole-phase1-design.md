# NextRole — Phase 1 Design

**Date:** 2026-09-30  
**Status:** Approved — implementation plan next  
**Path:** `~/Git/Me/NextRole`

## Goal

Build a production-quality **Job Application Tracker** portfolio project. Phase 1 delivers a runnable monorepo with Fastify API, React/Vite frontend, PostgreSQL via Prisma, Docker Compose (Postgres + Redis), secure cookie-based authentication (access JWT + refresh sessions with reuse detection), explicit CSRF, rate-limited auth endpoints, tests, CI scaffolding, and README — then stop.

Later phases add applications, Kanban, timeline, interviews, dashboard stats, and BullMQ reminders.

## Decisions (locked)

| Topic                         | Choice                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Location / name               | `~/Git/Me/NextRole`                                                                                                              |
| Layout                        | npm workspaces: `apps/api`, `apps/web`                                                                                           |
| Package manager               | npm (workspaces)                                                                                                                 |
| Node                          | Active LTS (pin in `.nvmrc`, e.g. 22)                                                                                            |
| Backend                       | Fastify + TypeScript (not Next.js)                                                                                               |
| Frontend                      | React + Vite + React Router + TanStack Query + Tailwind                                                                          |
| Dev networking                | Vite **proxies** `/api` → API (browser same-origin)                                                                              |
| Prod networking (Phase 1 doc) | Same-origin reverse proxy in front of web+api; separate API host deferred                                                        |
| Access token                  | JWT HS256, httpOnly cookie `access_token`, ~15m                                                                                  |
| Refresh token                 | Opaque 32-byte random (base64url); httpOnly cookie `refresh_token`, ~7d; SHA-256(+pepper) in DB; rotate + family reuse detection |
| Sessions                      | Each `RefreshToken` row = one auth session (no session UI)                                                                       |
| CSRF                          | Cookie `csrf_token` ↔ header `X-CSRF-Token`; Origin allowlist on mutations                                                       |
| CORS                          | Allowlist + credentials; used for non-proxied clients/tests — **not** CSRF protection                                            |
| Refresh storage               | PostgreSQL only                                                                                                                  |
| Password hashing              | Argon2id via `argon2`; params in `password.ts`                                                                                   |
| Cookie `__Host-`              | **Not used** in Phase 1                                                                                                          |
| Phase 1 data                  | `User` + `RefreshToken` only                                                                                                     |
| Git hooks                     | Deferred (no Husky in Phase 1)                                                                                                   |

## Architecture

```text
Browser (localhost:5173)
   │  credentials: include
   │  X-CSRF-Token on mutations
   │  /api/* → Vite proxy → API :3000
   ▼
Fastify API (:3000)
   │  secure headers (@fastify/helmet)
   │  Origin check (mutations)
   │  CSRF check (mutations)
   │  rate limit (strict on auth)
   │  auth middleware (access cookie)
   ▼
Auth module (service layer)
   ▼
PostgreSQL / Prisma — User, RefreshToken
Redis — compose only; unused
```

### Boundaries

- Thin routes; logic in services.
- Prisma = data-access boundary; **no** repository layer.
- No `packages/shared`.
- `GET /api/me` lives under `modules/users` (or thin users route calling a small users service); auth module owns register/login/logout/refresh/cookies/sessions.

### Out of Phase 1 / non-goals

Applications CRUD, Kanban, activities, interviews, dashboard analytics, BullMQ workers, file uploads, email, AI, payments, shared packages, Turborepo, pnpm, Next.js, Redis-backed auth, session UI, `__Host-` cookies, multi-device session UI, email verification, password reset.

## Repository structure

```text
NextRole/
  apps/
    api/
      prisma/schema.prisma
      prisma/migrations/
      src/
        modules/
          auth/
            routes.ts
            schemas.ts
            auth.service.ts
            password.ts
            tokens.ts
            sessions.ts
            csrf.ts
          users/
            routes.ts
            schemas.ts
            users.service.ts
        shared/
          errors/
          middleware/     # authGuard, csrf, origin, errorHandler
          validation/
        config/           # env Zod schema
        db/               # Prisma client singleton
        jobs/             # empty stub README only
        app.ts            # build Fastify instance (testable)
        server.ts         # listen
      vitest.config.ts
      package.json
    web/
      src/
        pages/            # Login, Register, Dashboard
        components/
        lib/apiClient.ts
        lib/csrf.ts
        App.tsx
        main.tsx
      vite.config.ts      # proxy /api → http://localhost:3000
      package.json
  docker-compose.yml
  .github/workflows/ci.yml
  .nvmrc
  .env.example
  package.json
  README.md
  docs/superpowers/specs/
```

### Auth module responsibilities

| File              | Responsibility                                             |
| ----------------- | ---------------------------------------------------------- |
| `routes.ts`       | HTTP only                                                  |
| `schemas.ts`      | Zod bodies/responses                                       |
| `auth.service.ts` | register / login / logout / refresh orchestration          |
| `password.ts`     | Argon2id hash + verify                                     |
| `tokens.ts`       | Access JWT issue/verify; opaque refresh raw generation     |
| `sessions.ts`     | Persist / rotate / revoke / reuse detection (transactions) |
| `csrf.ts`         | Generate + validate double-submit                          |

## Data model

### User

| Field                    | Notes                               |
| ------------------------ | ----------------------------------- |
| `id`                     | `cuid()`                            |
| `email`                  | unique; store **trimmed lowercase** |
| `passwordHash`           | Argon2id output                     |
| `name`                   | optional string                     |
| `createdAt`, `updatedAt` |                                     |

### RefreshToken (session)

```text
User
 ├── Session A (family F1)
 ├── Session B (family F1, after rotation)
 └── Session C (family F2, other login)
```

| Field               | Notes                                               |
| ------------------- | --------------------------------------------------- | --- | ------------------- |
| `id`                | `cuid()`                                            |
| `userId`            | FK → User, `onDelete: Cascade`                      |
| `tokenHash`         | SHA-256 hex of `UTF-8(pepper)                       |     | UTF-8(raw)`; unique |
| `familyId`          | `cuid()` at login/register; stable across rotations |
| `replacedByTokenId` | nullable self-FK; `onDelete: SetNull`               |
| `expiresAt`         | ~7d from issue of this row                          |
| `revokedAt`         | null = active                                       |
| `lastUsedAt`        | set on create; updated on successful refresh        |
| `createdAt`         |                                                     |

Indexes: unique `tokenHash`; `userId`; `familyId`; `expiresAt`.

Deferred columns (not Phase 1): `userAgent`, `ip`, device label.

## Request / response contracts

### Bodies

```text
GET  /api/auth/csrf      → { ok: true }  (+ ensure csrf_token cookie)
POST /api/auth/register  { email, password, name? }
POST /api/auth/login     { email, password }
POST /api/auth/logout    (no body; requires refresh cookie + CSRF)
POST /api/auth/refresh   (no body; refresh cookie + CSRF)
GET  /api/me             → { id, email, name, createdAt }
```

### Validation

- Email: valid email, max 255, normalized to lowercase trim before lookup/store.
- Password: min **8**, max **128** characters (Phase 1; no complexity meter).
- Name: optional, max 100.

### Status codes

| Case                   | Status | `error.code` (example) |
| ---------------------- | ------ | ---------------------- |
| Validation failure     | 400    | `VALIDATION_ERROR`     |
| Bad credentials        | 401    | `INVALID_CREDENTIALS`  |
| Missing/invalid access | 401    | `UNAUTHORIZED`         |
| Refresh reuse detected | 401    | `AUTH_REUSE_DETECTED`  |
| CSRF failure           | 403    | `CSRF_INVALID`         |
| Disallowed Origin      | 403    | `FORBIDDEN_ORIGIN`     |
| Duplicate email        | 409    | `EMAIL_TAKEN`          |
| Rate limited           | 429    | `RATE_LIMITED`         |

Error body:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

Optional `details` array only for `VALIDATION_ERROR`. No stacks in production.

## Authentication behavior

### Password hashing (Argon2id)

- Package: `argon2`.
- Algorithm: Argon2id.
- Defaults in `password.ts`; optional env overrides: `ARGON2_MEMORY_COST`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM`.
- During implementation: quick local benchmark; record final defaults in README.
- Why not bcrypt: new app; OWASP prefers Argon2id; no legacy hashes.

### Access JWT

- Alg: **HS256**; secret: `JWT_ACCESS_SECRET` (min length enforced in env schema, ≥32 chars).
- Claims: `sub` = userId, `iat`, `exp` (~15m from `ACCESS_TOKEN_TTL_SECONDS`).
- Cookie only — never in JSON.

### Refresh token lifecycle

1. Raw = `base64url(crypto.randomBytes(32))`.
2. Store `SHA-256(UTF-8(pepper) || UTF-8(raw))` as hex only. Pepper **required** in env.
3. Login/register: new `familyId`; insert session; set `access_token`, `refresh_token`, `csrf_token` cookies (`Max-Age` aligned to TTLs).
4. Refresh (single DB transaction):
   - `SELECT … FOR UPDATE` session by hash.
   - Missing / expired (`expiresAt <= now`) / unknown → 401; clear cookies.
   - **Reuse path:** row has `revokedAt != null`:
     - If `replacedByTokenId` set **and** `revokedAt` within `REFRESH_REUSE_GRACE_MS` (default **10000**): **idempotent-ish retry** — walk to current family tip; **mint a new refresh successor** from that tip (rotate tip → new raw); set cookies to the new raw + new access JWT; do **not** kill family.  
       Rationale: raw tip tokens are never stored, so the server cannot re-emit the previous tip cookie; minting a new successor is the implementable equivalent of “hand the client a valid tip” without family revoke. FE single-flight refresh makes multi-tab races rare.
     - Else: revoke **all** sessions with that `familyId`; clear cookies; **401** `AUTH_REUSE_DETECTED`.
   - **Happy path:** set `revokedAt` on current; create successor same `familyId`; set `replacedByTokenId`; set `lastUsedAt` on new row; new access + refresh cookies; **keep existing CSRF** (do not rotate on refresh — avoids racing parallel POSTs).
5. Logout: requires **refresh cookie** (access optional) + CSRF. Revoke **current** session only; clear all three cookies. Helper `revokeAllSessions(userId)` for later — no HTTP route in Phase 1.
6. Login timing: unknown email still runs a dummy Argon2 verify so failure cost ≈ wrong password (reduce user enumeration via timing).

### Cookies

| Name            | httpOnly | Path        | SameSite | Secure              |
| --------------- | -------- | ----------- | -------- | ------------------- |
| `access_token`  | yes      | `/`         | Lax      | iff `COOKIE_SECURE` |
| `refresh_token` | yes      | `/api/auth` | Lax      | iff `COOKIE_SECURE` |
| `csrf_token`    | **no**   | `/`         | Lax      | iff `COOKIE_SECURE` |

- No `Domain` attribute (host-only).
- Set `Max-Age` (and/or `Expires`) to match access/refresh TTLs; CSRF cookie `Max-Age` = refresh TTL (or longer session of FE tab — pin to refresh TTL).
- `__Host-` deferred: conflicts with refresh `Path=/api/auth`; local HTTP lacks `Secure`.

### CSRF bootstrap (was missing)

Login/register are POSTs and need CSRF **before** auth.

**Rule:** If request has no `csrf_token` cookie, middleware (or hook on responses) sets a new secure-random CSRF cookie on **every** response, including `GET`s. Frontend login/register pages: ensure at least one GET to `/api/me` or lightweight `GET /api/auth/csrf` (returns `{ ok: true }`, sets cookie) before submit.

Pinned Phase 1 approach:

1. `GET /api/auth/csrf` — public; ensures CSRF cookie.
2. Global hook: if CSRF cookie missing on any response, set one.
3. FE: call `GET /api/auth/csrf` on Login/Register mount.

### CSRF + Origin rules

```text
csrf_token cookie (not HttpOnly)
       │ compared (timing-safe) with
       ▼
X-CSRF-Token header
```

- CSRF value: `base64url(crypto.randomBytes(32))` — never derived from JWT/user/email.
- Mutations: require match; safe methods skip.
- Mutations: require `Origin` header ∈ `CORS_ORIGIN` allowlist (comma-separated exact origins).
  - With Vite proxy, browser Origin is `http://localhost:5173`.
  - If `Origin` **absent** on a mutation: **reject 403** `FORBIDDEN_ORIGIN` (no Referer fallback in Phase 1 — simpler, explicit).
- Non-browser clients in tests set `Origin` explicitly.

### Rate limiting

| Route                     | Limit source                                        |
| ------------------------- | --------------------------------------------------- |
| `POST /api/auth/register` | `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS` |
| `POST /api/auth/login`    | same                                                |
| `POST /api/auth/refresh`  | same                                                |
| Other routes              | no strict limit in Phase 1 (or high default)        |

Plugin: `@fastify/rate-limit`. Key: IP. Response **429**.

## Frontend (Phase 1)

Pages: `/login`, `/register`, `/dashboard` (placeholder), `/` → redirect from `GET /api/me`.

No `/settings`, no applications UI.

### Vite

- Dev server port **5173**.
- `server.proxy['/api']` → `http://localhost:3000`.
- API listen **3000**.

### apiClient

- `credentials: 'include'`.
- Mutations: read `csrf_token` → `X-CSRF-Token`.
- 401 → single-flight `POST /api/auth/refresh` → retry original **once** → else clear state / hard navigate `/login`.
- Refresh call uses a **raw** fetch path **without** the 401→refresh interceptor.
- Concurrent 401s await the same refresh promise.

## Infrastructure & DX

**Docker Compose:** Postgres 16 (`5432`), Redis 7 (`6379`). Named volume for Postgres. Healthchecks recommended.

**Env (Zod, fail fast on boot):**

| Var                         | Required | Notes                        |
| --------------------------- | -------- | ---------------------------- |
| `DATABASE_URL`              | yes      |                              |
| `JWT_ACCESS_SECRET`         | yes      | ≥32 chars                    |
| `REFRESH_TOKEN_PEPPER`      | yes      | ≥32 chars                    |
| `CORS_ORIGIN`               | yes      | e.g. `http://localhost:5173` |
| `COOKIE_SECURE`             | yes      | `true`/`false`               |
| `PORT`                      | no       | default `3000`               |
| `NODE_ENV`                  | yes      |                              |
| `ACCESS_TOKEN_TTL_SECONDS`  | no       | default `900`                |
| `REFRESH_TOKEN_TTL_SECONDS` | no       | default `604800`             |
| `REFRESH_REUSE_GRACE_MS`    | no       | default `10000`              |
| `AUTH_RATE_LIMIT_MAX`       | no       | default e.g. `20`            |
| `AUTH_RATE_LIMIT_WINDOW_MS` | no       | default e.g. `60000`         |
| `ARGON2_*`                  | no       | optional overrides           |

**Scripts (root + workspaces):** `dev`, `build`, `test`, `lint`, `format`, `db:migrate`, `db:seed` (optional empty/minimal).

**Tests:** Vitest in `apps/api`; integration tests spin Fastify via `app.ts` + real Postgres (Compose or CI service). Prefer integration over heavy mocks for auth.

**CI:** Node from `.nvmrc` → `npm ci` → lint → typecheck → test (Postgres service) → build.

**Secure headers:** `@fastify/helmet` enabled.

## Testing checklist (Phase 1)

### Auth

- Register / login / logout / me.
- Unauthenticated me → 401.
- Duplicate email → 409.
- Password hash absent from all JSON bodies.
- `Set-Cookie` for `access_token` / `refresh_token` includes `HttpOnly`; `csrf_token` does not.

### Refresh

- A → B rotation; A revoked; B works.
- Reuse A after grace → family revoked → 401 `AUTH_REUSE_DETECTED`.
- Reuse A within grace after rotation → idempotent success (no family kill).

### CSRF / Origin

- POST no header → 403.
- POST wrong token → 403.
- POST cookie without header → 403.
- POST correct → success.
- GET no CSRF → allowed.
- POST disallowed/missing Origin → 403.

### Rate limit

- Exceed auth limit → 429 (use low limits in test env).

### CSRF bootstrap

- `GET /api/auth/csrf` sets `csrf_token` cookie.

## Success criteria

1. Compose up: Postgres + Redis healthy.
2. Migrate; register → login → me works via cookies (proxied FE or direct API tests).
3. Rotation + reuse (+ grace) behave as specified.
4. CSRF/Origin/rate-limit tests pass.
5. FE: register/login → dashboard; refresh single-flight; no refresh loop.
6. Lint, typecheck, test, build green locally + CI workflow present.
7. README: setup, env table, mermaid architecture, Argon2id, `__Host-` deferral, proxy decision, scripts.

## Explicitly deferred (not missing by accident)

| Item                              | Why deferred                             |
| --------------------------------- | ---------------------------------------- |
| Application domain models         | Later phases                             |
| BullMQ / Redis usage              | Later phases                             |
| `__Host-` cookies                 | Path + local HTTP constraints            |
| Session list UI / device metadata | Structure ready (`lastUsedAt`); UI later |
| Password reset / email verify     | Out of scope                             |
| SameSite=None cross-site deploy   | Phase 1 = same-origin via proxy          |
| Referer fallback for Origin       | Reject missing Origin instead            |
| Husky                             | Optional DX later                        |
| Shared package                    | YAGNI                                    |

## Self-review changelog (this pass)

Corrections applied to the prior draft:

1. **CSRF bootstrap** — login/register need CSRF before auth; added `GET /api/auth/csrf` + ensure-cookie hook.
2. **Concurrent refresh false positive** — added `SELECT FOR UPDATE` + `REFRESH_REUSE_GRACE_MS` idempotent retry.
3. **Pinned names** — cookie names, JWT HS256, SHA-256+pepper, refresh byte length, ports, status codes, body shapes.
4. **`REFRESH_TOKEN_PEPPER` required** — no longer optional hand-wave.
5. **Vite proxy** — same-origin browser path; CORS for tests/direct API.
6. **Origin** — exact allowlist; missing Origin → 403 (no Referer fallback).
7. **`users/` module** — owns `GET /api/me`.
8. **Helmet, .nvmrc, env table, validation rules, 409/429** — filled in.
9. **Logout scope** — current session only; `revokeAllSessions` helper, no route.
10. **Git hooks** — explicitly deferred.

## Final review verdict

**Ship to implementation plan:** yes. Phase 1 scope coherent; auth/CSRF/session threats covered; contracts pinned enough to build without guessing.

**Residual risk (accepted):**

- Reuse grace window (10s) can briefly hand the post-rotation tip to both a racing client and a thief who refreshes in the same window — industry-common tradeoff; family kill still applies after grace.
- Vite proxy same-origin assumes Phase 1 deploy stays behind one origin; cross-site API host needs a later cookie/SameSite pass.

**Not this document:** step-by-step implementation plan (`docs/superpowers/plans/…`) — write next after explicit approval to proceed.

## Still intentionally thin (implementation plan / coding time)

- Exact Argon2 numeric defaults (one local benchmark → README).
- ESLint/Prettier config file contents.
- Optional seed data.
- Mermaid diagram (README).
- CI YAML exact steps.
- Frontend unit tests (API integration tests are the Phase 1 bar; FE smoke manual OK).

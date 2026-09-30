# NextRole Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Runnable npm-workspaces monorepo with Fastify cookie auth (Argon2id, refresh rotation + family reuse detection, CSRF, rate limits), React/Vite login shell, Docker Postgres+Redis, Vitest tests, CI, README — then stop (no applications domain).

**Architecture:** `apps/api` = Fastify + Prisma; `apps/web` = Vite proxy `/api` → `:3000`; refresh sessions hashed in Postgres; Redis compose-only idle.

**Tech Stack:** Node 22, npm workspaces, Fastify 5.x, Prisma, PostgreSQL 16, Redis 7, Zod, argon2, jose, Vitest, React 19, Vite 6, React Router 7, TanStack Query 5, Tailwind 4, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-nextrole-phase1-design.md` (binding). Read it before Task 1.

## Subagent execution notes

- Workdir: `/Users/aniisabihi/Git/Me/NextRole` (repo already exists; docs already present). Do **not** create a second project root.
- Fresh subagent per task: **do not** rely on “prior draft” memory — every required artifact is inlined below.
- Each task ends with: focused tests green → full `npm run test -w apps/api` when api exists → commit that task only.
- Do not start Task N+1 features inside Task N.
- Do not implement applications/Kanban/BullMQ.
- Never commit `.env` or real secrets.
- If spec and plan conflict: **spec wins**, note deviation in commit body.

## Global Constraints

- Workspaces: `apps/api`, `apps/web` only.
- Cookies: `access_token` (httpOnly, Path=`/`), `refresh_token` (httpOnly, Path=`/api/auth`), `csrf_token` (NOT httpOnly, Path=`/`); SameSite=`lax`; Secure iff `COOKIE_SECURE`; no `Domain`; Max-Age access=`ACCESS_TOKEN_TTL_SECONDS`, refresh+csrf=`REFRESH_TOKEN_TTL_SECONDS`.
- Access JWT: `jose` HS256; refresh: 32-byte base64url; DB hash = SHA-256 hex of `UTF-8(pepper)||UTF-8(raw)`.
- CSRF header `X-CSRF-Token` timing-safe equals cookie; mutations require `Origin` ∈ allowlist; missing Origin → 403 `FORBIDDEN_ORIGIN`.
- Grace reuse: revoked + `replacedByTokenId` + within grace → walk tip → **mint new successor** → set cookies; else family revoke → 401 `AUTH_REUSE_DETECTED`.
- Do not rotate CSRF on refresh.
- Logout: refresh cookie + CSRF; access optional; revoke current session only.
- API: `"type":"module"`, TS `NodeNext`, Vitest ESM.
- Errors: `{ error: { code, message, details? } }`.
- Gate: lint + typecheck + test + build.
- HTTP: register **201**, login/refresh/logout/csrf **200**, me **200**.
- JSON user shape (register/login/me): `{ id, email, name, createdAt }` — never `passwordHash`. Register/login body: `{ user: { … } }`. Me body: user object at top level `{ id, email, name, createdAt }`.

---

## File map

```text
package.json, .nvmrc, .gitignore, .env.example, docker-compose.yml
.prettierrc, eslint.config.js
.github/workflows/ci.yml
README.md
apps/api/package.json, tsconfig.json, vitest.config.ts
apps/api/prisma/schema.prisma, prisma/migrations/**, prisma/seed.ts
apps/api/src/config/env.ts
apps/api/src/db/prisma.ts
apps/api/src/shared/errors/app-error.ts
apps/api/src/shared/middleware/{error-handler,origin,csrf,auth-guard}.ts
apps/api/src/shared/validation/parse.ts
apps/api/src/modules/auth/{routes,schemas,auth.service,password,tokens,sessions,csrf,cookies}.ts
apps/api/src/modules/users/{routes,schemas,users.service}.ts
apps/api/src/{app,server}.ts
apps/api/src/jobs/README.md
apps/api/tests/setup.ts
apps/api/tests/helpers/{http,db}.ts
apps/api/tests/health.test.ts
apps/api/tests/auth/{password,tokens,csrf-unit,sessions,register-login,me,refresh,csrf-origin,rate-limit}.test.ts
apps/web/** (Vite React-TS)
```

---

### Task 1: Monorepo scaffold + Docker + env templates

**Files:**

- Create: `package.json`, `.nvmrc`, `.gitignore`, `.env.example`, `docker-compose.yml`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Create: `apps/web/package.json`

**Done when:** `docker compose ps` shows postgres+redis healthy; files above exist; commit created.

- [ ] **Step 1: Root `package.json`**

```json
{
  "name": "nextrole",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test -w apps/api",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "format": "prettier -w .",
    "db:migrate": "npm run db:migrate -w apps/api",
    "db:seed": "npm run db:seed -w apps/api"
  }
}
```

- [ ] **Step 2: `.nvmrc`** contents: `22`

- [ ] **Step 3: `.gitignore`**

```gitignore
node_modules
dist
build
.env
apps/*/.env
coverage
.DS_Store
*.log
```

- [ ] **Step 4: `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: nextrole
      POSTGRES_PASSWORD: nextrole
      POSTGRES_DB: nextrole
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nextrole -d nextrole"]
      interval: 5s
      timeout: 5s
      retries: 10
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pgdata:
```

- [ ] **Step 5: `.env.example`**

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://nextrole:nextrole@localhost:5432/nextrole
JWT_ACCESS_SECRET=dev-access-secret-change-me-32chars-min
REFRESH_TOKEN_PEPPER=dev-refresh-pepper-change-me-32chars
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=604800
REFRESH_REUSE_GRACE_MS=10000
AUTH_RATE_LIMIT_MAX=20
AUTH_RATE_LIMIT_WINDOW_MS=60000
ARGON2_MEMORY_COST=65536
ARGON2_TIME_COST=3
ARGON2_PARALLELISM=1
```

- [ ] **Step 6: `apps/api/package.json`**

```json
{
  "name": "api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 7: `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 8: `apps/web/package.json`**

```json
{
  "name": "web",
  "private": true
}
```

- [ ] **Step 9: Start compose**

```bash
docker compose up -d
docker compose ps
```

Expected: both services healthy/running.

- [ ] **Step 10: Commit**

```bash
git add package.json .nvmrc .gitignore .env.example docker-compose.yml apps/api/package.json apps/api/tsconfig.json apps/web/package.json
git commit -m "$(cat <<'EOF'
chore: scaffold NextRole workspaces and Docker services

EOF
)"
```

---

### Task 2: Install API deps + Prisma schema + migrate

**Depends on:** Task 1, Postgres up.

**Files:**

- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`, `apps/api/.env` (gitignored)
- Create: migration under `apps/api/prisma/migrations/`
- Modify: lockfile via npm

**Done when:** `npx prisma migrate status` (in apps/api) shows applied; `@prisma/client` generates; migration committed; `.env` not committed.

- [ ] **Step 1: Install**

```bash
npm install -w apps/api fastify @fastify/cors @fastify/helmet @fastify/cookie @fastify/rate-limit zod argon2 jose @prisma/client
npm install -w apps/api -D typescript tsx vitest @types/node prisma prettier eslint typescript-eslint dotenv
```

- [ ] **Step 2: Write `apps/api/prisma/schema.prisma` exactly**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String         @id @default(cuid())
  email        String         @unique
  passwordHash String
  name         String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  sessions     RefreshToken[]
}

model RefreshToken {
  id                String         @id @default(cuid())
  userId            String
  user              User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash         String         @unique
  familyId          String
  replacedByTokenId String?
  replacedBy        RefreshToken?  @relation("TokenReplacement", fields: [replacedByTokenId], references: [id], onDelete: SetNull)
  replaces          RefreshToken[] @relation("TokenReplacement")
  expiresAt         DateTime
  revokedAt         DateTime?
  lastUsedAt        DateTime
  createdAt         DateTime       @default(now())

  @@index([userId])
  @@index([familyId])
  @@index([expiresAt])
}
```

- [ ] **Step 3: `apps/api/prisma/seed.ts`**

```ts
console.log("No seed data for Phase 1");
```

- [ ] **Step 4: `apps/api/.env`** — copy `.env.example` values (local only)

- [ ] **Step 5: Migrate**

```bash
npm run db:migrate:dev -w apps/api -- --name init_auth
```

Expected: migration SQL created + applied; client generated.

- [ ] **Step 6: Commit** (include `package-lock.json`, prisma schema, migrations, seed — **exclude** `.env`)

```bash
git add package-lock.json apps/api/package.json apps/api/prisma
git commit -m "$(cat <<'EOF'
chore: add Prisma auth schema and initial migration

EOF
)"
```

---

### Task 3: Env, errors, Prisma client, Fastify skeleton + health test

**Depends on:** Task 2.

**Files:** listed under Interfaces create paths.

**Ruling — env loading:** `loadEnv()` reads `process.env` **every call** (no module-level cache) so tests can mutate env before `buildApp()`.

**Ruling — DUMMY hash:** deferred to Task 4; not needed here.

- [ ] **Step 1: `apps/api/src/config/env.ts`**

```ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  CORS_ORIGIN: z.string().min(1),
  COOKIE_SECURE: z.enum(["true", "false"]).transform((v) => v === "true"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  REFRESH_REUSE_GRACE_MS: z.coerce.number().int().nonnegative().default(10000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function parseCorsOrigins(corsOrigin: string): string[] {
  return corsOrigin
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
```

- [ ] **Step 2: `apps/api/src/db/prisma.ts`**

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 3: `apps/api/src/shared/errors/app-error.ts`**

```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
```

- [ ] **Step 4: `apps/api/src/shared/validation/parse.ts`**

```ts
import type { ZodType } from "zod";
import { AppError } from "../errors/app-error.js";

export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Invalid request",
      result.error.flatten(),
    );
  }
  return result.data;
}
```

- [ ] **Step 5: `apps/api/src/shared/middleware/error-handler.ts`** — map `AppError` → JSON; Zod already via AppError; unknown → 500 `INTERNAL_ERROR` (hide stack unless `NODE_ENV!==production`); if `error.statusCode===429` → `{ error: { code: "RATE_LIMITED", message: "Too many requests" } }`

- [ ] **Step 6: `apps/api/src/app.ts`** — `buildApp()`:
  - `loadEnv()`
  - register helmet, cors (`origin: parseCorsOrigins(env.CORS_ORIGIN)`, `credentials: true`), cookie (unsigned)
  - set error handler
  - `GET /api/health` → `{ ok: true }`
  - return app (**no auth routes yet**)

- [ ] **Step 7: `apps/api/src/server.ts`** — `buildApp()` then `listen({ port: env.PORT, host: "0.0.0.0" })`

- [ ] **Step 8: `apps/api/src/jobs/README.md`**

```md
# Jobs

Reserved for BullMQ workers in a later phase. Unused in Phase 1.
```

- [ ] **Step 9: `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
});
```

- [ ] **Step 10: `apps/api/tests/setup.ts`**

```ts
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, "../.env") });
process.env.NODE_ENV = "test";
```

- [ ] **Step 11: Health test** — create `apps/api/tests/health.test.ts` as in previous plan (inject GET `/api/health` → 200)

- [ ] **Step 12: Verify + commit**

```bash
npm run test -w apps/api
npm run typecheck -w apps/api
git add apps/api/src apps/api/tests apps/api/vitest.config.ts
git commit -m "$(cat <<'EOF'
feat: add Fastify app skeleton with env validation and health check

EOF
)"
```

---

### Task 4: password.ts + tokens.ts

**Depends on:** Task 3.

**Ruling — dummy hash:** export `async function ensureDummyPasswordHash(): Promise<string>` with module-private `let cache: string | null`; first call hashes `"dummy-password-not-a-user"` once. Login awaits this when user missing. Avoid top-level await.

- [ ] **Step 1: Failing tests** `tests/auth/password.test.ts`, `tokens.test.ts`

Password: hash ≠ plaintext; verify true/false.  
Tokens: sign/verify round-trip; `generateRefreshTokenRaw()` length > 40; same raw → same `hashRefreshToken`.

- [ ] **Step 2: Implement `password.ts`**

```ts
import argon2 from "argon2";
import { loadEnv } from "../../config/env.js";

export async function hashPassword(plain: string): Promise<string> {
  const env = loadEnv();
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM,
  });
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyCache: string | null = null;
export async function ensureDummyPasswordHash(): Promise<string> {
  if (!dummyCache) {
    dummyCache = await hashPassword("dummy-password-not-a-user");
  }
  return dummyCache;
}
```

- [ ] **Step 3: Implement `tokens.ts`**

```ts
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { loadEnv } from "../../config/env.js";

function accessSecret(): Uint8Array {
  return new TextEncoder().encode(loadEnv().JWT_ACCESS_SECRET);
}

export async function signAccessToken(userId: string): Promise<string> {
  const env = loadEnv();
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret());
}

export async function verifyAccessToken(
  token: string,
): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, accessSecret());
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Invalid token subject");
  }
  return { sub: payload.sub };
}

export function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(raw: string): string {
  const pepper = loadEnv().REFRESH_TOKEN_PEPPER;
  return createHash("sha256")
    .update(pepper, "utf8")
    .update(raw, "utf8")
    .digest("hex");
}
```

- [ ] **Step 4: Tests PASS + commit**

```bash
npm run test -w apps/api
git add apps/api/src/modules/auth/password.ts apps/api/src/modules/auth/tokens.ts apps/api/tests/auth
git commit -m "$(cat <<'EOF'
feat: add Argon2id password hashing and JWT/refresh token helpers

EOF
)"
```

---

### Task 5: CSRF helpers, cookies, origin/csrf middleware

**Depends on:** Task 3–4.

**Ruling — ensure CSRF:** only set when request has **no** `csrf_token` cookie; never rotate an existing one here.

**Ruling — timingSafeEqual:** if lengths differ, still do a compare against a dummy buffer then throw (avoid early return timing leak).

- [ ] **Step 1: Failing unit tests** for `assertCsrf` in `tests/auth/csrf-unit.test.ts`

- [ ] **Step 2: `modules/auth/csrf.ts`** — `createCsrfToken()`, `assertCsrf(cookie, header)` throws `AppError("CSRF_INVALID", 403, ...)`

- [ ] **Step 3: `modules/auth/cookies.ts`**

```ts
import type { FastifyReply } from "fastify";
import { loadEnv } from "../../config/env.js";

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { access: string; refresh: string; csrf: string },
): void {
  const env = loadEnv();
  const base = {
    path: "/",
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
  };
  reply.setCookie("access_token", tokens.access, {
    ...base,
    httpOnly: true,
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS,
  });
  reply.setCookie("refresh_token", tokens.refresh, {
    ...base,
    path: "/api/auth",
    httpOnly: true,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
  });
  reply.setCookie("csrf_token", tokens.csrf, {
    ...base,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  const env = loadEnv();
  const clear = {
    path: "/",
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
  };
  reply.clearCookie("access_token", { ...clear, httpOnly: true });
  reply.clearCookie("refresh_token", {
    ...clear,
    path: "/api/auth",
    httpOnly: true,
  });
  reply.clearCookie("csrf_token", { ...clear, httpOnly: false });
}

export function setCsrfCookie(reply: FastifyReply, token: string): void {
  const env = loadEnv();
  reply.setCookie("csrf_token", token, {
    path: "/",
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
  });
}
```

- [ ] **Step 4: Middleware**
  - `ensureCsrfCookie` on `onRequest`: if `!request.cookies.csrf_token` → create + `setCsrfCookie`
  - `originPreHandler`: if method not GET/HEAD/OPTIONS → require Origin in allowlist else `FORBIDDEN_ORIGIN` 403
  - `csrfPreHandler`: if mutating → `assertCsrf(request.cookies.csrf_token, request.headers["x-csrf-token"])`

- [ ] **Step 5: Wire into `buildApp`** (after cookie plugin)

- [ ] **Step 6: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add CSRF double-submit helpers and Origin middleware

EOF
)"
```

---

### Task 6: sessions.ts (DB)

**Depends on:** Tasks 2–4.

**Files:** `sessions.ts`, `tests/auth/sessions.test.ts`, `tests/helpers/db.ts`

**`tests/helpers/db.ts`:**

```ts
import { prisma } from "../../src/db/prisma.js";

export async function resetDb(): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(
  email = "user@example.com",
): Promise<{ id: string }> {
  const { hashPassword } = await import("../../src/modules/auth/password.js");
  const passwordHash = await hashPassword("password12");
  return prisma.user.create({
    data: { email, passwordHash, name: "Test" },
    select: { id: true },
  });
}
```

**`rotateSession` algorithm (must follow):**

1. `hash = hashRefreshToken(raw)`
2. Transaction:
   - `SELECT * FROM "RefreshToken" WHERE "tokenHash" = $hash FOR UPDATE` (Prisma `$queryRaw`)
   - Map raw row fields (Prisma returns camelCase when using model API; for raw SQL use quoted identifiers and map manually to camelCase)
   - If no row OR `expiresAt <= now` (and not taking grace path on expired revoked): throw `UNAUTHORIZED` 401
   - If `revokedAt != null`:
     - If `replacedByTokenId` && `now - revokedAt <= grace`: walk `replacedByTokenId` until tip where `revokedAt == null` (if tip missing/revoked unexpectedly, kill family + `AUTH_REUSE_DETECTED`); then **mintSuccessor(tip)**; return `{ raw: newRaw, userId }`
     - Else: `UPDATE RefreshToken SET revokedAt=now WHERE familyId=… AND revokedAt IS NULL` (and mark all); throw `AUTH_REUSE_DETECTED`
   - Else happy: mintSuccessor(current) where mintSuccessor = revoke row, create new row same familyId, set replacedByTokenId, lastUsedAt=now, expiresAt=now+refreshTTL; return new raw

Prefer implementing `mintSuccessor(tx, parentRow)` once and calling from happy + grace paths.

- [ ] **Step 1: Write failing session tests** using `resetDb` + `createTestUser`
- [ ] **Step 2: Implement `sessions.ts` exporting `createSession`, `rotateSession`, `revokeSessionByRaw`, `revokeAllSessions`**
- [ ] **Step 3: PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat: implement refresh session rotation and reuse detection

EOF
)"
```

---

### Task 7: Auth HTTP surface (service, routes, me, rate limit) + http helpers

**Depends on:** Tasks 5–6.

**Create `tests/helpers/http.ts` in this task** (Task 8 reuses it).

```ts
import type { FastifyInstance, LightMyRequestResponse } from "fastify";

export const TEST_ORIGIN = "http://localhost:5173";

export function parseCookies(
  res: LightMyRequestResponse,
): Record<string, string> {
  const setCookies = res.cookies ?? [];
  // Also support raw set-cookie headers if needed via res.headers["set-cookie"]
  const out: Record<string, string> = {};
  for (const c of setCookies) {
    out[c.name] = c.value;
  }
  return out;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export async function bootstrapCsrf(
  app: FastifyInstance,
): Promise<Record<string, string>> {
  const res = await app.inject({ method: "GET", url: "/api/auth/csrf" });
  return parseCookies(res);
}
```

Note: Fastify inject exposes `res.cookies` when `@fastify/cookie` is registered — use that.

**Auth service responsibilities:**

- `register`: normalize email; if exists → `EMAIL_TAKEN` 409; hash password; create user; `createSession`; `signAccessToken`; `createCsrfToken`; `setAuthCookies`; return user DTO
- `login`: normalize; lookup; if missing `verifyPassword(await ensureDummyPasswordHash(), password)` then `INVALID_CREDENTIALS`; if present verify or `INVALID_CREDENTIALS`; new session family; set cookies; return user DTO
- `logout`: `revokeSessionByRaw`; `clearAuthCookies`
- `refresh`: `rotateSession`; `signAccessToken`; `setAuthCookies` with **existing** csrf from request cookie (do not create new csrf); return 200 empty or `{ ok: true }`

**Routes:** thin; `parseBody` on register/login; rate-limit plugin **only** on register/login/refresh route scope.

**authGuard:** read `access_token` cookie → `verifyAccessToken` → `request.userId`; else 401 `UNAUTHORIZED`.

**users:** `GET /api/me` → `getMe(userId)`.

- [ ] **Step 1: Create http helpers + failing `tests/auth/register-login.test.ts`**

Flow: bootstrapCsrf → POST register with Origin + Cookie + X-CSRF-Token → expect 201 → GET /api/me with access cookie → 200.

- [ ] **Step 2: Implement schemas, auth.service, routes, users.\*, auth-guard; register in `buildApp`**
- [ ] **Step 3: Test PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat: wire auth routes, session cookies, and /api/me

EOF
)"
```

---

### Task 8: Expand auth HTTP tests (cookies, logout, duplicate)

**Depends on:** Task 7.

- [ ] **Step 1: Add/extend tests in `register-login.test.ts` and `me.test.ts`**

Must cover:

1. Register Set-Cookie flags: access+refresh HttpOnly; csrf not HttpOnly (assert via `res.cookies` attributes `.httpOnly`)
2. Login → me shape; no `passwordHash` key anywhere in JSON
3. Me without cookies → 401
4. Duplicate email → 409 `EMAIL_TAKEN`
5. Logout with refresh+CSRF+Origin → me 401
6. GET `/api/auth/csrf` sets `csrf_token`

- [ ] **Step 2: All PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
test: cover auth cookie flags, logout, and duplicate email

EOF
)"
```

---

### Task 9: Refresh reuse + CSRF/Origin matrix + rate limit tests

**Depends on:** Task 8.

**Ruling — rate limit test:** in `beforeAll`, set `process.env.AUTH_RATE_LIMIT_MAX="3"` then `buildApp()` (loadEnv every call). Use unique emails per attempt OR same login with wrong password to avoid 409. Prefer repeated **login** with bad password after one valid user exists.

- [ ] **Step 1: `refresh.test.ts`**
  - Login → capture refresh A → POST refresh → B ≠ A; me works with new access
  - Immediately reuse A (within grace) → 200; family not fully revoked (tip exists)
  - Set `REFRESH_REUSE_GRACE_MS=0` for a dedicated app instance **or** backdate `revokedAt` via prisma → reuse A → 401 `AUTH_REUSE_DETECTED`

- [ ] **Step 2: `csrf-origin.test.ts`** — matrix from spec (missing header, wrong token, cookie without header, success, GET without CSRF, bad Origin, missing Origin)

- [ ] **Step 3: `rate-limit.test.ts`** — 4th limited auth POST → 429 `RATE_LIMITED`

- [ ] **Step 4: Full suite PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
test: cover refresh reuse, CSRF/Origin, and auth rate limits

EOF
)"
```

---

### Task 10: Frontend auth shell

**Depends on:** Task 7+ (API runnable).

**Scaffold command** (from repo root):

```bash
npm create vite@latest apps/web-tmp -- --template react-ts
# move files into apps/web replacing placeholder package.json; remove apps/web-tmp
```

Or hand-write Vite react-ts structure into `apps/web`. Final `apps/web/package.json` name=`web`, private, scripts `dev`/`build`/`typecheck`/`lint`.

**`vite.config.ts`:**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

**`src/lib/csrf.ts`:** parse `document.cookie` for `csrf_token`.

**`src/lib/apiClient.ts`:** full behavior:

```ts
let refreshPromise: Promise<boolean> | null = null;

async function rawRefresh(): Promise<boolean> {
  const csrf = getCsrfToken();
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: csrf ? { "X-CSRF-Token": csrf } : {},
  });
  return res.ok;
}

async function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = rawRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiClient<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    const csrf = getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const doFetch = () =>
    fetch(path, { ...init, method, headers, credentials: "include" });

  let res = await doFetch();
  if (res.status === 401 && path !== "/api/auth/refresh") {
    const ok = await refreshOnce();
    if (!ok) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    res = await doFetch();
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

**Pages:** Login + Register (mount → `fetch('/api/auth/csrf', { credentials:'include' })`); Dashboard (`apiClient('/api/me')`); `/` redirects based on me success.

**UI:** minimal functional Tailwind; no design polish requirement.

- [ ] **Step 1: Scaffold + deps** (`react-router-dom`, `@tanstack/react-query`, `tailwindcss`, `@tailwindcss/vite`)
- [ ] **Step 2: Implement csrf, apiClient, pages, router**
- [ ] **Step 3: Manual smoke** — api+web dev; register → dashboard
- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add Vite auth shell with CSRF-aware api client

EOF
)"
```

---

### Task 11: ESLint/Prettier, CI, README, final gate

**Depends on:** Tasks 1–10.

- [ ] **Step 1: `.prettierrc`**

```json
{
  "singleQuote": false,
  "semi": true,
  "trailingComma": "all"
}
```

- [ ] **Step 2: Minimal flat `eslint.config.js`** covering `apps/api/**/*.ts` and `apps/web/src/**/*.{ts,tsx}` with typescript-eslint recommended; ignore `dist`, `node_modules`. Wire workspace lint scripts so `npm run lint` works (if web eslint not ready, api must lint; web can use `eslint . --max-warnings 0` or `exit 0` only if documented — prefer both lint clean).

- [ ] **Step 3: `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: nextrole
          POSTGRES_PASSWORD: nextrole
          POSTGRES_DB: nextrole
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U nextrole -d nextrole"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://nextrole:nextrole@localhost:5432/nextrole
      JWT_ACCESS_SECRET: ci-access-secret-at-least-32-chars-long
      REFRESH_TOKEN_PEPPER: ci-refresh-pepper-at-least-32-chars
      CORS_ORIGIN: http://localhost:5173
      COOKIE_SECURE: "false"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run db:migrate -w apps/api
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -w apps/api
      - run: npm run build
```

- [ ] **Step 4: `README.md`** must include: what/why; mermaid architecture; setup (compose, copy env, migrate, `npm run dev`); env table; Argon2id defaults; `__Host-` deferred; Vite proxy; grace mint note; scripts; API endpoint list; testing; CI; Phase 1 non-goals.

- [ ] **Step 5: Local gate**

```bash
docker compose up -d
npm run db:migrate
npm run lint
npm run typecheck
npm run test
npm run build
```

All green required.

- [ ] **Step 6: Commit + STOP**

```bash
git commit -m "$(cat <<'EOF'
chore: add CI, lint/format config, and Phase 1 README

EOF
)"
```

Do **not** begin applications features.

---

## Spec coverage

| Spec requirement                          | Task   |
| ----------------------------------------- | ------ |
| Workspaces + Compose                      | 1      |
| Prisma User/RefreshToken                  | 2      |
| Env Zod + helmet/cors/health              | 3      |
| Argon2id + dummy verify                   | 4, 7   |
| JWT + refresh hash                        | 4      |
| Session rotate / grace mint / family kill | 6, 9   |
| CSRF + Origin                             | 5, 7–9 |
| Auth routes + rate limit                  | 7, 9   |
| `/api/me` + HttpOnly assertions           | 7–8    |
| FE proxy + single-flight                  | 10     |
| lint/typecheck/test/build CI + README     | 11     |

## SDD readiness review (this pass)

**Fixed for subagents:**

1. Removed “see prior draft” — full compose, env, prisma, code inlined.
2. Task dependency order + **http helpers moved to Task 7** (was blocked on Task 8).
3. `loadEnv()` every call — rate-limit tests workable.
4. Dummy hash via `ensureDummyPasswordHash()` — no top-level await.
5. Grace algorithm spelled as `mintSuccessor` shared path.
6. Register **201** / response shapes pinned.
7. Exact commit messages per task.
8. Fastify `res.cookies` for assertions.
9. Spec duplicate reuse `Else` line removed.
10. Workdir + SDD notes at top.

**Still intentionally thin (OK):** Tailwind visual polish; exact eslint rule list beyond “typescript recommended”; Argon2 benchmark (defaults pinned already).

**Plan status:** Ready for subagent-driven development.

---

## Execution handoff

**1. Subagent-Driven (recommended)** · **2. Inline Execution**

Say which when you want implementation to start.

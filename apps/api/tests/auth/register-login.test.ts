import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { resetDb } from "../helpers/db.js";
import {
  TEST_ORIGIN,
  bootstrapCsrf,
  cookieHeader,
  parseCookies,
} from "../helpers/http.js";

describe("auth HTTP: register / login / logout / csrf", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("GET /api/auth/csrf sets csrf_token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/csrf" });
    expect(res.statusCode).toBe(200);
    const cookies = parseCookies(res);
    expect(cookies.csrf_token).toBeTruthy();
  });

  it("registers with CSRF then returns /api/me", async () => {
    const cookies = await bootstrapCsrf(app);
    expect(cookies.csrf_token).toBeTruthy();

    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
      payload: {
        email: "new@example.com",
        password: "password12",
        name: "New User",
      },
    });

    expect(registerRes.statusCode).toBe(201);
    const registerBody = registerRes.json();
    expect(registerBody.user).toMatchObject({
      email: "new@example.com",
      name: "New User",
    });
    expect(registerBody.user.id).toBeTruthy();
    expect(registerBody.user.createdAt).toBeTruthy();
    expect(registerBody.user).not.toHaveProperty("passwordHash");

    const authCookies = { ...cookies, ...parseCookies(registerRes) };
    expect(authCookies.access_token).toBeTruthy();

    const meRes = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: {
        Cookie: cookieHeader(authCookies),
      },
    });

    expect(meRes.statusCode).toBe(200);
    expect(meRes.json()).toMatchObject({
      id: registerBody.user.id,
      email: "new@example.com",
      name: "New User",
    });
    expect(meRes.json()).not.toHaveProperty("passwordHash");
  });

  it("register Set-Cookie: access+refresh HttpOnly; csrf not HttpOnly", async () => {
    const cookies = await bootstrapCsrf(app);

    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
      payload: {
        email: "flags@example.com",
        password: "password12",
        name: "Flags",
      },
    });

    expect(registerRes.statusCode).toBe(201);

    const byName = Object.fromEntries(
      (registerRes.cookies ?? []).map((c) => [c.name, c]),
    );
    expect(byName.access_token?.httpOnly).toBe(true);
    expect(byName.refresh_token?.httpOnly).toBe(true);
    // light-my-request omits httpOnly when false (not present in Set-Cookie)
    expect(byName.csrf_token?.httpOnly).toBeFalsy();
    expect(byName.csrf_token).toBeDefined();
  });

  it("duplicate email → 409 EMAIL_TAKEN", async () => {
    const cookies = await bootstrapCsrf(app);
    const payload = {
      email: "dup@example.com",
      password: "password12",
      name: "First",
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const csrf2 = await bootstrapCsrf(app);
    const second = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(csrf2),
        "X-CSRF-Token": csrf2.csrf_token!,
      },
      payload: { ...payload, name: "Second" },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: { code: "EMAIL_TAKEN" },
    });
  });

  it("logout with refresh+CSRF+Origin → me 401", async () => {
    const cookies = await bootstrapCsrf(app);
    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
      payload: {
        email: "logout@example.com",
        password: "password12",
        name: "Logout",
      },
    });
    expect(registerRes.statusCode).toBe(201);

    const authCookies = { ...cookies, ...parseCookies(registerRes) };

    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(authCookies),
        "X-CSRF-Token": authCookies.csrf_token!,
      },
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json()).toEqual({ ok: true });

    // Client honors clearCookie Set-Cookie — subsequent me has no auth cookies.
    const meRes = await app.inject({
      method: "GET",
      url: "/api/me",
    });
    expect(meRes.statusCode).toBe(401);
  });
});

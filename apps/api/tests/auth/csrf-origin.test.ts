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

describe("CSRF / Origin matrix", () => {
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

  const registerPayload = {
    email: "csrf-matrix@example.com",
    password: "password12",
    name: "CSRF",
  };

  it("POST no X-CSRF-Token header → 403 CSRF_INVALID", async () => {
    const cookies = await bootstrapCsrf(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
      },
      payload: { ...registerPayload, email: "csrf-no-header@example.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "CSRF_INVALID" } });
  });

  it("POST wrong X-CSRF-Token → 403 CSRF_INVALID", async () => {
    const cookies = await bootstrapCsrf(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": "wrong-token-value-not-matching-cookie",
      },
      payload: { ...registerPayload, email: "csrf-wrong@example.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "CSRF_INVALID" } });
  });

  it("POST csrf cookie without header → 403 CSRF_INVALID", async () => {
    const cookies = await bootstrapCsrf(app);
    expect(cookies.csrf_token).toBeTruthy();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        // deliberately omit X-CSRF-Token
      },
      payload: { ...registerPayload, email: "csrf-cookie-only@example.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "CSRF_INVALID" } });
  });

  it("POST correct CSRF + Origin → success", async () => {
    const cookies = await bootstrapCsrf(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
      payload: { ...registerPayload, email: "csrf-ok@example.com" },
    });
    expect(res.statusCode).toBe(201);
    expect(parseCookies(res).access_token).toBeTruthy();
  });

  it("GET without CSRF → allowed", async () => {
    const csrfRes = await app.inject({ method: "GET", url: "/api/auth/csrf" });
    expect(csrfRes.statusCode).toBe(200);

    const meRes = await app.inject({ method: "GET", url: "/api/me" });
    expect(meRes.statusCode).toBe(401);
    expect(meRes.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("POST disallowed Origin → 403 FORBIDDEN_ORIGIN", async () => {
    const cookies = await bootstrapCsrf(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: "http://evil.example",
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
      payload: { ...registerPayload, email: "csrf-bad-origin@example.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN_ORIGIN" } });
  });

  it("POST missing Origin → 403 FORBIDDEN_ORIGIN", async () => {
    const cookies = await bootstrapCsrf(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
      payload: { ...registerPayload, email: "csrf-no-origin@example.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN_ORIGIN" } });
  });
});

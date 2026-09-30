import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { hashRefreshToken } from "../../src/modules/auth/tokens.js";
import { resetDb } from "../helpers/db.js";
import {
  TEST_ORIGIN,
  bootstrapCsrf,
  cookieHeader,
  parseCookies,
} from "../helpers/http.js";

describe("auth HTTP: refresh rotation + reuse", () => {
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

  async function registerAndLogin(
    email: string,
  ): Promise<Record<string, string>> {
    const csrf = await bootstrapCsrf(app);
    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(csrf),
        "X-CSRF-Token": csrf.csrf_token!,
      },
      payload: { email, password: "password12", name: "Refresh User" },
    });
    expect(registerRes.statusCode).toBe(201);
    return { ...csrf, ...parseCookies(registerRes) };
  }

  it("login → refresh A→B; me works with new access", async () => {
    const cookies = await registerAndLogin("refresh-rotate@example.com");
    const refreshA = cookies.refresh_token!;
    expect(refreshA).toBeTruthy();

    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
    });
    expect(refreshRes.statusCode).toBe(200);

    const after = { ...cookies, ...parseCookies(refreshRes) };
    const refreshB = after.refresh_token!;
    expect(refreshB).toBeTruthy();
    expect(refreshB).not.toBe(refreshA);
    expect(after.access_token).toBeTruthy();

    const meRes = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { Cookie: cookieHeader(after) },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json()).toMatchObject({
      email: "refresh-rotate@example.com",
    });
  });

  it("reuse A within grace → 200; family tip still active", async () => {
    const cookies = await registerAndLogin("refresh-grace@example.com");
    const refreshA = cookies.refresh_token!;

    const rotateRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
    });
    expect(rotateRes.statusCode).toBe(200);
    const afterB = { ...cookies, ...parseCookies(rotateRes) };
    expect(afterB.refresh_token).not.toBe(refreshA);

    const reuseRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader({ ...cookies, refresh_token: refreshA }),
        "X-CSRF-Token": cookies.csrf_token!,
      },
    });
    expect(reuseRes.statusCode).toBe(200);

    const aRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(refreshA) },
    });
    const active = await prisma.refreshToken.findMany({
      where: { familyId: aRow.familyId, revokedAt: null },
    });
    expect(active).toHaveLength(1);

    const reuseCookies = { ...cookies, ...parseCookies(reuseRes) };
    expect(reuseCookies.refresh_token).toBeTruthy();
    expect(active[0]!.tokenHash).toBe(
      hashRefreshToken(reuseCookies.refresh_token!),
    );
  });

  it("reuse A after grace → 401 AUTH_REUSE_DETECTED", async () => {
    const cookies = await registerAndLogin("refresh-reuse@example.com");
    const refreshA = cookies.refresh_token!;

    const rotateRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(cookies),
        "X-CSRF-Token": cookies.csrf_token!,
      },
    });
    expect(rotateRes.statusCode).toBe(200);

    const aRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(refreshA) },
    });
    await prisma.refreshToken.update({
      where: { id: aRow.id },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const reuseRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader({ ...cookies, refresh_token: refreshA }),
        "X-CSRF-Token": cookies.csrf_token!,
      },
    });
    expect(reuseRes.statusCode).toBe(401);
    expect(reuseRes.json()).toMatchObject({
      error: { code: "AUTH_REUSE_DETECTED" },
    });

    const active = await prisma.refreshToken.count({
      where: { familyId: aRow.familyId, revokedAt: null },
    });
    expect(active).toBe(0);
  });
});

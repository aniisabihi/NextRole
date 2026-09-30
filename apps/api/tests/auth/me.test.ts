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

describe("/api/me", () => {
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

  it("me without cookies → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("login → me shape; no passwordHash in JSON", async () => {
    const csrf = await bootstrapCsrf(app);

    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(csrf),
        "X-CSRF-Token": csrf.csrf_token!,
      },
      payload: {
        email: "loginme@example.com",
        password: "password12",
        name: "Login Me",
      },
    });
    expect(registerRes.statusCode).toBe(201);

    // Fresh CSRF for login mutation
    const csrf2 = await bootstrapCsrf(app);
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(csrf2),
        "X-CSRF-Token": csrf2.csrf_token!,
      },
      payload: {
        email: "loginme@example.com",
        password: "password12",
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.user).toMatchObject({
      email: "loginme@example.com",
      name: "Login Me",
    });
    expect(loginBody.user.id).toBeTruthy();
    expect(loginBody.user.createdAt).toBeTruthy();
    expect(JSON.stringify(loginBody)).not.toContain("passwordHash");

    const authCookies = { ...csrf2, ...parseCookies(loginRes) };
    const meRes = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: {
        Cookie: cookieHeader(authCookies),
      },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json();
    expect(meBody).toMatchObject({
      id: loginBody.user.id,
      email: "loginme@example.com",
      name: "Login Me",
    });
    expect(meBody.createdAt).toBeTruthy();
    expect(JSON.stringify(meBody)).not.toContain("passwordHash");
    expect(Object.keys(meBody).sort()).toEqual(
      ["createdAt", "email", "id", "name"].sort(),
    );
  });
});

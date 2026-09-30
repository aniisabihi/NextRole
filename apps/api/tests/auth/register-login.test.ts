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

describe("register → me", () => {
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
});

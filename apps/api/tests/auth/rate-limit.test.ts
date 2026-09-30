import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createTestUser, resetDb } from "../helpers/db.js";
import {
  TEST_ORIGIN,
  bootstrapCsrf,
  cookieHeader,
} from "../helpers/http.js";

describe("auth rate limit", () => {
  let app: FastifyInstance;
  const prevMax = process.env.AUTH_RATE_LIMIT_MAX;

  beforeAll(async () => {
    // loadEnv() reads process.env every call — set before buildApp
    process.env.AUTH_RATE_LIMIT_MAX = "3";
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (prevMax === undefined) {
      delete process.env.AUTH_RATE_LIMIT_MAX;
    } else {
      process.env.AUTH_RATE_LIMIT_MAX = prevMax;
    }
  });

  it("4th limited auth POST → 429 RATE_LIMITED", async () => {
    await createTestUser("ratelimit@example.com");

    async function badLogin() {
      const csrf = await bootstrapCsrf(app);
      return app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          Origin: TEST_ORIGIN,
          Cookie: cookieHeader(csrf),
          "X-CSRF-Token": csrf.csrf_token!,
        },
        payload: {
          email: "ratelimit@example.com",
          password: "wrong-password",
        },
      });
    }

    for (let i = 0; i < 3; i++) {
      const res = await badLogin();
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({
        error: { code: "INVALID_CREDENTIALS" },
      });
    }

    const limited = await badLogin();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  });
});

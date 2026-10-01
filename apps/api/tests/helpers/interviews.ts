import { expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { TEST_ORIGIN } from "./http.js";
import { registerAndLogin } from "./applications.js";

export async function loginSession(app: FastifyInstance) {
  return registerAndLogin(app);
}

export function mutHeaders(
  session: Awaited<ReturnType<typeof registerAndLogin>>,
) {
  return {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
    "X-CSRF-Token": session.cookies.csrf_token!,
    "Content-Type": "application/json",
  };
}

export async function createApplicationFor(
  app: FastifyInstance,
  session: Awaited<ReturnType<typeof registerAndLogin>>,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/applications",
    headers: mutHeaders(session),
    payload: {
      company: "Co",
      title: "Role",
      employmentType: "FULL_TIME",
      workplaceType: "REMOTE",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().application as { id: string };
}

export function isoOffset(minutesFromNow = 60) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

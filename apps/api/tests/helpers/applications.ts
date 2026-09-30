import type { FastifyInstance } from "fastify";
import {
  TEST_ORIGIN,
  bootstrapCsrf,
  cookieHeader,
  parseCookies,
} from "./http.js";

export async function registerAndLogin(app: FastifyInstance) {
  const cookies = await bootstrapCsrf(app);
  const email = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const registerRes = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: {
      Origin: TEST_ORIGIN,
      Cookie: cookieHeader(cookies),
      "X-CSRF-Token": cookies.csrf_token!,
    },
    payload: {
      email,
      password: "password12",
      name: "App User",
    },
  });

  if (registerRes.statusCode !== 201) {
    throw new Error(
      `register failed: ${registerRes.statusCode} ${registerRes.body}`,
    );
  }

  const merged = { ...cookies, ...parseCookies(registerRes) };
  return {
    cookies: merged,
    cookieHeader: cookieHeader(merged),
    user: registerRes.json().user as {
      id: string;
      email: string;
      name: string | null;
      createdAt: string;
    },
  };
}

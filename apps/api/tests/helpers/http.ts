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

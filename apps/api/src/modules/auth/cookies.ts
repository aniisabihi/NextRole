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

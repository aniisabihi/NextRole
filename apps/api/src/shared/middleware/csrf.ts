import type { FastifyReply, FastifyRequest } from "fastify";
import { createCsrfToken, assertCsrf } from "../../modules/auth/csrf.js";
import { setCsrfCookie } from "../../modules/auth/cookies.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function ensureCsrfCookie(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.cookies.csrf_token) {
    setCsrfCookie(reply, createCsrfToken());
  }
}

export async function csrfPreHandler(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (SAFE_METHODS.has(request.method)) {
    return;
  }

  assertCsrf(request.cookies.csrf_token, request.headers["x-csrf-token"]);
}

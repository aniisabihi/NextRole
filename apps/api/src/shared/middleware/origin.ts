import type { FastifyReply, FastifyRequest } from "fastify";
import { loadEnv, parseCorsOrigins } from "../../config/env.js";
import { AppError } from "../errors/app-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function originPreHandler(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (SAFE_METHODS.has(request.method)) {
    return;
  }

  const origin = request.headers.origin;
  const allowlist = parseCorsOrigins(loadEnv().CORS_ORIGIN);
  if (typeof origin !== "string" || !allowlist.includes(origin)) {
    throw new AppError("FORBIDDEN_ORIGIN", 403, "Forbidden origin");
  }
}

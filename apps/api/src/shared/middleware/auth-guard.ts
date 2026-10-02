import type { FastifyRequest } from "fastify";
import { AppError } from "../errors/app-error.js";
import { verifyAccessToken } from "../../modules/auth/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

export async function authGuard(request: FastifyRequest): Promise<void> {
  const token = request.cookies.access_token;
  if (!token) {
    throw new AppError("UNAUTHORIZED", 401, "Please sign in to continue.");
  }

  try {
    const { sub } = await verifyAccessToken(token);
    request.userId = sub;
  } catch {
    throw new AppError("UNAUTHORIZED", 401, "Please sign in to continue.");
  }
}

import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { getMe } from "./users.service.js";

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    return getMe(userId);
  });
}

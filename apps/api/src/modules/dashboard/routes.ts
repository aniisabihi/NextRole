import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { getDashboardStats } from "./dashboard.service.js";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/stats", { preHandler: [authGuard] }, async (request) => {
    return getDashboardStats(request.userId!);
  });
}

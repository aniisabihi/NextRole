import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { parseBody, parseQuery } from "../../shared/validation/parse.js";
import * as applicationsService from "./applications.service.js";
import { attachNextInterviewAt } from "./next-interview.js";
import {
  boardBulkStatusSchema,
  boardReorderSchema,
  createApplicationSchema,
  listApplicationsQuerySchema,
  updateApplicationSchema,
} from "./schemas.js";

export async function applicationsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    const query = parseQuery(listApplicationsQuerySchema, request.query);
    const result = await applicationsService.listApplications(userId, query);
    const items = await attachNextInterviewAt(result.items);
    return { ...result, items };
  });

  app.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const body = parseBody(createApplicationSchema, request.body);
    const application = await applicationsService.createApplication(
      userId,
      body,
    );
    const [enriched] = await attachNextInterviewAt([application]);
    return reply.status(201).send({ application: enriched });
  });

  app.post("/board/reorder", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    const body = parseBody(boardReorderSchema, request.body);
    return applicationsService.reorderBoardCell(userId, body);
  });

  app.post(
    "/board/bulk-status",
    { preHandler: [authGuard] },
    async (request) => {
      const userId = request.userId!;
      const body = parseBody(boardBulkStatusSchema, request.body);
      const result = await applicationsService.bulkUpdateStatus(userId, body);
      const moved = await attachNextInterviewAt(result.moved);
      return { ...result, moved };
    },
  );

  app.get("/:id", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const found = await applicationsService.getApplication(userId, id);
    const [application] = await attachNextInterviewAt([found]);
    return { application };
  });

  app.patch("/:id", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const patch = parseBody(updateApplicationSchema, request.body);
    const updated = await applicationsService.updateApplication(
      userId,
      id,
      patch,
    );
    const [application] = await attachNextInterviewAt([updated]);
    return { application };
  });

  app.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    await applicationsService.deleteApplication(userId, id);
    return reply.status(204).send();
  });

  app.get("/:id/activities", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const items = await applicationsService.listActivities(userId, id);
    return { items };
  });
}

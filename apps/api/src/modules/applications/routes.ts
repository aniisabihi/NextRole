import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { parseBody, parseQuery } from "../../shared/validation/parse.js";
import * as applicationsService from "./applications.service.js";
import {
  boardBulkStatusSchema,
  boardReorderSchema,
  createApplicationSchema,
  listApplicationsQuerySchema,
  updateApplicationSchema,
} from "./schemas.js";

export async function applicationsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { preHandler: [authGuard] },
    async (request) => {
      const userId = request.userId!;
      const query = parseQuery(listApplicationsQuerySchema, request.query);
      return applicationsService.listApplications(userId, query);
    },
  );

  app.post(
    "/",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.userId!;
      const body = parseBody(createApplicationSchema, request.body);
      const application = await applicationsService.createApplication(
        userId,
        body,
      );
      return reply.status(201).send({ application });
    },
  );

  app.post(
    "/board/reorder",
    { preHandler: [authGuard] },
    async (request) => {
      const userId = request.userId!;
      const body = parseBody(boardReorderSchema, request.body);
      return applicationsService.reorderBoardCell(userId, body);
    },
  );

  app.post(
    "/board/bulk-status",
    { preHandler: [authGuard] },
    async (request) => {
      const userId = request.userId!;
      const body = parseBody(boardBulkStatusSchema, request.body);
      return applicationsService.bulkUpdateStatus(userId, body);
    },
  );

  app.get(
    "/:id",
    { preHandler: [authGuard] },
    async (request) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const application = await applicationsService.getApplication(userId, id);
      return { application };
    },
  );

  app.patch(
    "/:id",
    { preHandler: [authGuard] },
    async (request) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const patch = parseBody(updateApplicationSchema, request.body);
      const application = await applicationsService.updateApplication(
        userId,
        id,
        patch,
      );
      return { application };
    },
  );

  app.delete(
    "/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      await applicationsService.deleteApplication(userId, id);
      return reply.status(204).send();
    },
  );

  app.get(
    "/:id/activities",
    { preHandler: [authGuard] },
    async (request) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const items = await applicationsService.listActivities(userId, id);
      return { items };
    },
  );
}

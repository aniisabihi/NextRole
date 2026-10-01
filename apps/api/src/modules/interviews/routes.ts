import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { parseBody } from "../../shared/validation/parse.js";
import * as interviewsService from "./interviews.service.js";
import { createInterviewSchema, updateInterviewSchema } from "./schemas.js";

export async function interviewsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    const { applicationId } = request.params as { applicationId: string };
    return interviewsService.listInterviews(userId, applicationId);
  });

  app.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const { applicationId } = request.params as { applicationId: string };
    const body = parseBody(createInterviewSchema, request.body);
    const interview = await interviewsService.createInterview(
      userId,
      applicationId,
      body,
    );
    return reply.status(201).send({ interview });
  });

  app.patch("/:id", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    const { applicationId, id } = request.params as {
      applicationId: string;
      id: string;
    };
    const body = parseBody(updateInterviewSchema, request.body);
    const interview = await interviewsService.updateInterview(
      userId,
      applicationId,
      id,
      body,
    );
    return { interview };
  });

  app.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const { applicationId, id } = request.params as {
      applicationId: string;
      id: string;
    };
    await interviewsService.deleteInterview(userId, applicationId, id);
    return reply.status(204).send();
  });
}

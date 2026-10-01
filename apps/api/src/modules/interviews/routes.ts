import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { parseBody } from "../../shared/validation/parse.js";
import * as interviewsService from "./interviews.service.js";
import { createInterviewSchema } from "./schemas.js";

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
}

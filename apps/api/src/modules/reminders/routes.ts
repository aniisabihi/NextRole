import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { parseBody, parseQuery } from "../../shared/validation/parse.js";
import * as remindersService from "./reminders.service.js";
import {
  createManualReminderSchema,
  listRemindersQuerySchema,
  updateReminderSchema,
} from "./schemas.js";

/** Registered under /api/applications/:applicationId/reminders */
export async function applicationRemindersRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const { applicationId } = request.params as { applicationId: string };
    const body = parseBody(createManualReminderSchema, request.body);
    const reminder = await remindersService.createManualReminder(
      userId,
      applicationId,
      body,
    );
    return reply.status(201).send(reminder);
  });
}

/** Registered under /api/reminders */
export async function remindersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: [authGuard] }, async (request) => {
    const query = parseQuery(listRemindersQuerySchema, request.query);
    return remindersService.listReminders(request.userId!, query);
  });

  app.patch("/:id", { preHandler: [authGuard] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(updateReminderSchema, request.body);
    return remindersService.updateReminder(request.userId!, id, body);
  });

  app.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await remindersService.deleteReminder(request.userId!, id);
    return reply.status(204).send();
  });
}

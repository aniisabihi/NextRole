import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard.js";
import { parseBody } from "../../shared/validation/parse.js";
import { updateReminderPrefsSchema } from "./schemas.js";
import {
  getMe,
  getReminderPrefs,
  updateReminderPrefs,
} from "./users.service.js";

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
    return getMe(userId);
  });

  app.get(
    "/me/reminder-prefs",
    { preHandler: [authGuard] },
    async (request) => {
      return getReminderPrefs(request.userId!);
    },
  );

  app.patch(
    "/me/reminder-prefs",
    { preHandler: [authGuard] },
    async (request) => {
      const body = parseBody(updateReminderPrefsSchema, request.body);
      return updateReminderPrefs(request.userId!, body);
    },
  );
}

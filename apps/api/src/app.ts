import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { loadEnv, parseCorsOrigins } from "./config/env.js";
import { errorHandler } from "./shared/middleware/error-handler.js";
import { ensureCsrfCookie, csrfPreHandler } from "./shared/middleware/csrf.js";
import { originPreHandler } from "./shared/middleware/origin.js";
import { applicationsRoutes } from "./modules/applications/routes.js";
import { interviewsRoutes } from "./modules/interviews/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { usersRoutes } from "./modules/users/routes.js";
import {
  applicationRemindersRoutes,
  remindersRoutes,
} from "./modules/reminders/routes.js";
import { closeReminderQueue } from "./jobs/queue.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";

export async function buildApp() {
  const env = loadEnv();

  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: parseCorsOrigins(env.CORS_ORIGIN),
    credentials: true,
  });
  await app.register(cookie);

  app.addHook("onRequest", ensureCsrfCookie);
  app.addHook("preHandler", originPreHandler);
  app.addHook("preHandler", csrfPreHandler);

  app.setErrorHandler(errorHandler);

  app.get("/api/health", async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(usersRoutes, { prefix: "/api" });
  await app.register(applicationsRoutes, { prefix: "/api/applications" });
  await app.register(interviewsRoutes, {
    prefix: "/api/applications/:applicationId/interviews",
  });
  await app.register(applicationRemindersRoutes, {
    prefix: "/api/applications/:applicationId/reminders",
  });
  await app.register(remindersRoutes, { prefix: "/api/reminders" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });

  app.addHook("onClose", async () => {
    await closeReminderQueue();
  });

  return app;
}

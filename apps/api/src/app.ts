import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { loadEnv, parseCorsOrigins } from "./config/env.js";
import { errorHandler } from "./shared/middleware/error-handler.js";

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

  app.setErrorHandler(errorHandler);

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}

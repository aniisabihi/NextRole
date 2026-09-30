import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "../../config/env.js";
import { parseBody } from "../../shared/validation/parse.js";
import * as authService from "./auth.service.js";
import { loginBodySchema, registerBodySchema } from "./schemas.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();

  app.get("/csrf", async () => ({ ok: true }));

  await app.register(async (limited) => {
    await limited.register(rateLimit, {
      max: env.AUTH_RATE_LIMIT_MAX,
      timeWindow: env.AUTH_RATE_LIMIT_WINDOW_MS,
    });

    limited.post("/register", async (request, reply) => {
      const body = parseBody(registerBodySchema, request.body);
      const user = await authService.register(reply, body);
      return reply.status(201).send({ user });
    });

    limited.post("/login", async (request, reply) => {
      const body = parseBody(loginBodySchema, request.body);
      const user = await authService.login(reply, body);
      return reply.status(200).send({ user });
    });

    limited.post("/refresh", async (request, reply) => {
      await authService.refresh(
        reply,
        request.cookies.refresh_token,
        request.cookies.csrf_token,
      );
      return reply.status(200).send({ ok: true });
    });
  });

  app.post("/logout", async (request, reply) => {
    await authService.logout(reply, request.cookies.refresh_token);
    return reply.status(200).send({ ok: true });
  });
}

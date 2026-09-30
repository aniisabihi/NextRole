import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/app-error.js";

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    const body: {
      error: { code: string; message: string; details?: unknown };
    } = {
      error: {
        code: error.code,
        message: error.message,
      },
    };
    if (error.details !== undefined) {
      body.error.details = error.details;
    }
    void reply.status(error.statusCode).send(body);
    return;
  }

  if (error.statusCode === 429) {
    void reply.status(429).send({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
      },
    });
    return;
  }

  request.log.error(error);

  const payload: {
    error: { code: string; message: string; details?: unknown };
  } = {
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  };

  if (process.env.NODE_ENV !== "production") {
    payload.error.message = error.message || "Internal server error";
    if (error.stack) {
      payload.error.details = { stack: error.stack };
    }
  }

  void reply.status(500).send(payload);
}

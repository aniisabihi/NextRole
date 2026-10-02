import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/app-error.js";
import { isRecordNotFound, isUniqueViolation } from "../errors/prisma.js";

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
        message: "Too many attempts. Please wait a moment and try again.",
      },
    });
    return;
  }

  if (isUniqueViolation(error)) {
    void reply.status(409).send({
      error: {
        code: "CONFLICT",
        message: "That change conflicts with another update. Please try again.",
      },
    });
    return;
  }

  if (isRecordNotFound(error)) {
    void reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "We couldn’t find that item.",
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
      message: "Something went wrong. Please try again.",
    },
  };

  // Keep technical detail out of `message` (shown in the UI). Dev-only stack in details.
  if (process.env.NODE_ENV !== "production") {
    payload.error.details = {
      cause: error.message || undefined,
      stack: error.stack,
    };
  }

  void reply.status(500).send(payload);
}

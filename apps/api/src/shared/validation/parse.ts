import type { ZodType } from "zod";
import { AppError } from "../errors/app-error.js";

export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Invalid request",
      result.error.flatten(),
    );
  }
  return result.data;
}

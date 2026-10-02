import { Prisma } from "@prisma/client";

export function isPrismaKnownError(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

export function isUniqueViolation(err: unknown): boolean {
  return isPrismaKnownError(err) && err.code === "P2002";
}

export function isRecordNotFound(err: unknown): boolean {
  return isPrismaKnownError(err) && err.code === "P2025";
}

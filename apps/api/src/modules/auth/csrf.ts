import { randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "../../shared/errors/app-error.js";

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function assertCsrf(
  cookie: string | undefined,
  header: string | string[] | undefined,
): void {
  const headerValue = Array.isArray(header) ? header[0] : header;
  const cookieBuf = Buffer.from(cookie ?? "", "utf8");
  const headerBuf = Buffer.from(headerValue ?? "", "utf8");

  if (cookieBuf.length !== headerBuf.length) {
    timingSafeEqual(cookieBuf, Buffer.alloc(cookieBuf.length));
    throw new AppError("CSRF_INVALID", 403, "Invalid CSRF token");
  }

  if (
    cookieBuf.length === 0 ||
    !timingSafeEqual(cookieBuf, headerBuf)
  ) {
    throw new AppError("CSRF_INVALID", 403, "Invalid CSRF token");
  }
}

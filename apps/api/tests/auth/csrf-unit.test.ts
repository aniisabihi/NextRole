import { describe, expect, it } from "vitest";
import { AppError } from "../../src/shared/errors/app-error.js";
import { assertCsrf, createCsrfToken } from "../../src/modules/auth/csrf.js";

describe("createCsrfToken", () => {
  it("returns a base64url string longer than 40 characters", () => {
    const token = createCsrfToken();
    expect(token.length).toBeGreaterThan(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("assertCsrf", () => {
  it("does not throw when cookie and header match", () => {
    const token = createCsrfToken();
    expect(() => assertCsrf(token, token)).not.toThrow();
  });

  it("throws CSRF_INVALID 403 when tokens differ", () => {
    try {
      assertCsrf(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.code).toBe("CSRF_INVALID");
      expect(e.statusCode).toBe(403);
    }
  });

  it("throws CSRF_INVALID when lengths differ", () => {
    try {
      assertCsrf("short", "much-longer-csrf-token-value");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("CSRF_INVALID");
      expect((err as AppError).statusCode).toBe(403);
    }
  });

  it("throws CSRF_INVALID when cookie is missing", () => {
    try {
      assertCsrf(undefined, "some-token");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("CSRF_INVALID");
      expect((err as AppError).statusCode).toBe(403);
    }
  });

  it("throws CSRF_INVALID when header is missing", () => {
    try {
      assertCsrf("some-token", undefined);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("CSRF_INVALID");
      expect((err as AppError).statusCode).toBe(403);
    }
  });
});

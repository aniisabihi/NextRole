import type { ApplicationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/shared/errors/app-error.js";
import { assertTransition } from "../../src/modules/applications/status-transitions.js";

function expectInvalidTransition(from: ApplicationStatus, to: ApplicationStatus) {
  try {
    assertTransition(from, to);
    expect.unreachable();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    const e = err as AppError;
    expect(e.code).toBe("INVALID_STATUS_TRANSITION");
    expect(e.statusCode).toBe(400);
  }
}

describe("assertTransition", () => {
  it("allows SAVED → APPLIED", () => {
    expect(() => assertTransition("SAVED", "APPLIED")).not.toThrow();
  });

  it("allows APPLIED → OFFER", () => {
    expect(() => assertTransition("APPLIED", "OFFER")).not.toThrow();
  });

  it("throws INVALID_STATUS_TRANSITION for OFFER → APPLIED", () => {
    expectInvalidTransition("OFFER", "APPLIED");
  });

  it("allows REJECTED → WITHDRAWN", () => {
    expect(() => assertTransition("REJECTED", "WITHDRAWN")).not.toThrow();
  });

  it("allows WITHDRAWN → SAVED", () => {
    expect(() => assertTransition("WITHDRAWN", "SAVED")).not.toThrow();
  });

  it("throws for WITHDRAWN → SCREENING", () => {
    expectInvalidTransition("WITHDRAWN", "SCREENING");
  });

  it("no-ops OFFER → OFFER", () => {
    expect(() => assertTransition("OFFER", "OFFER")).not.toThrow();
  });
});

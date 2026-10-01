import { describe, expect, it } from "vitest";
import { canTransition } from "./status-transitions";

describe("canTransition", () => {
  it("allows SAVED -> APPLIED", () => {
    expect(canTransition("SAVED", "APPLIED")).toBe(true);
  });

  it("allows APPLIED -> OFFER", () => {
    expect(canTransition("APPLIED", "OFFER")).toBe(true);
  });

  it("blocks OFFER -> APPLIED", () => {
    expect(canTransition("OFFER", "APPLIED")).toBe(false);
  });

  it("allows REJECTED -> WITHDRAWN", () => {
    expect(canTransition("REJECTED", "WITHDRAWN")).toBe(true);
  });

  it("allows WITHDRAWN -> SAVED", () => {
    expect(canTransition("WITHDRAWN", "SAVED")).toBe(true);
  });

  it("blocks WITHDRAWN -> SCREENING", () => {
    expect(canTransition("WITHDRAWN", "SCREENING")).toBe(false);
  });

  it("allows OFFER -> OFFER", () => {
    expect(canTransition("OFFER", "OFFER")).toBe(true);
  });
});

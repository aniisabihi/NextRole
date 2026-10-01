import { describe, expect, it } from "vitest";
import { formatRatePercent } from "./dashboard-format";

describe("formatRatePercent", () => {
  it("formats zero", () => {
    expect(formatRatePercent(0)).toBe("0%");
  });

  it("rounds fractional rates", () => {
    expect(formatRatePercent(0.125)).toBe("13%");
  });

  it("formats full rate", () => {
    expect(formatRatePercent(1)).toBe("100%");
  });
});

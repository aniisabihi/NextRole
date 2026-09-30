import { describe, expect, it } from "vitest";
import { parseOptionalDateInput } from "../../src/modules/applications/dates.js";

describe("parseOptionalDateInput", () => {
  it("returns undefined when value is undefined", () => {
    expect(parseOptionalDateInput(undefined)).toBeUndefined();
  });

  it("returns null when value is null", () => {
    expect(parseOptionalDateInput(null)).toBeNull();
  });

  it("parses YYYY-MM-DD as UTC midnight that calendar day", () => {
    const result = parseOptionalDateInput("2024-01-15");
    expect(result).toEqual(new Date(Date.UTC(2024, 0, 15, 0, 0, 0, 0)));
  });

  it("parses full ISO datetime strings", () => {
    const iso = "2024-01-15T14:30:00.000Z";
    expect(parseOptionalDateInput(iso)).toEqual(new Date(iso));
  });

  it("throws on invalid date strings", () => {
    expect(() => parseOptionalDateInput("not-a-date")).toThrow();
  });
});

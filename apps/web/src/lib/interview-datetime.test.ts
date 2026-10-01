import { describe, expect, it } from "vitest";
import {
  fromDatetimeLocal,
  sameUtcMinute,
  toDatetimeLocal,
} from "./interview-datetime";

describe("toDatetimeLocal", () => {
  it("formats ISO as local value", () => {
    expect(toDatetimeLocal("2026-10-05T09:30:00.000Z")).toBe("2026-10-05T09:30");
  });

  it("pads single digits", () => {
    expect(toDatetimeLocal("2026-01-02T03:04:00.000Z")).toBe("2026-01-02T03:04");
  });

  it("throws on invalid", () => {
    expect(() => toDatetimeLocal("nope")).toThrow(RangeError);
  });
});

describe("fromDatetimeLocal", () => {
  it("converts to ISO", () => {
    expect(fromDatetimeLocal("2026-10-05T09:30")).toBe(
      "2026-10-05T09:30:00.000Z",
    );
  });

  it("round-trips", () => {
    const iso = "2026-10-05T14:45:00.000Z";
    expect(fromDatetimeLocal(toDatetimeLocal(iso))).toBe(iso);
  });

  it("throws on empty", () => {
    expect(() => fromDatetimeLocal("")).toThrow(RangeError);
  });

  it("throws on invalid", () => {
    expect(() => fromDatetimeLocal("garbage")).toThrow(RangeError);
  });
});

describe("sameUtcMinute", () => {
  it("true within same minute", () => {
    expect(
      sameUtcMinute("2026-10-05T09:30:00.000Z", "2026-10-05T09:30:59.999Z"),
    ).toBe(true);
  });

  it("false across minutes", () => {
    expect(
      sameUtcMinute("2026-10-05T09:30:59.999Z", "2026-10-05T09:31:00.000Z"),
    ).toBe(false);
  });
});

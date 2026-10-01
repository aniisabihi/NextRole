import { describe, expect, it } from "vitest";
import {
  badgeAriaLabel,
  badgeText,
  dueBadgeCount,
  formatBadgeCount,
} from "./reminder-badge";

describe("formatBadgeCount", () => {
  it("hides zero", () => {
    expect(formatBadgeCount(0)).toBeNull();
  });
  it("hides negative / NaN", () => {
    expect(formatBadgeCount(-3)).toBeNull();
    expect(formatBadgeCount(Number.NaN)).toBeNull();
  });
  it("shows 1", () => {
    expect(formatBadgeCount(1)).toBe("1");
  });
  it("shows 9", () => {
    expect(formatBadgeCount(9)).toBe("9");
  });
  it("caps 10 at 9+", () => {
    expect(formatBadgeCount(10)).toBe("9+");
  });
  it("caps large counts", () => {
    expect(formatBadgeCount(250)).toBe("9+");
  });
  it("floors fractions", () => {
    expect(formatBadgeCount(9.9)).toBe("9");
  });
});

describe("badgeText", () => {
  it("returns empty string when hidden", () => {
    expect(badgeText(0)).toBe("");
  });
  it("returns capped text", () => {
    expect(badgeText(12)).toBe("9+");
  });
});

describe("badgeAriaLabel", () => {
  it("uses exact count, not capped", () => {
    expect(badgeAriaLabel(12)).toBe("Reminders, 12 due");
  });
  it("is plain when none due", () => {
    expect(badgeAriaLabel(0)).toBe("Reminders, none due");
  });
  it("exact for 9", () => {
    expect(badgeAriaLabel(9)).toBe("Reminders, 9 due");
  });
});

describe("dueBadgeCount", () => {
  it("counts only DUE items", () => {
    expect(
      dueBadgeCount([
        { status: "DUE" },
        { status: "SCHEDULED" },
        { status: "DUE" },
        { status: "DISMISSED" },
      ]),
    ).toBe(2);
  });
  it("empty is zero", () => {
    expect(dueBadgeCount([])).toBe(0);
  });
});

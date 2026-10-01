import { describe, expect, it } from "vitest";
import { linkIfHttpUrl } from "./interview-url";

describe("linkIfHttpUrl", () => {
  it("accepts https", () => {
    expect(linkIfHttpUrl("https://meet.example.com/abc")).toBe(
      "https://meet.example.com/abc",
    );
  });

  it("accepts http", () => {
    expect(linkIfHttpUrl("http://example.com/")).toBe("http://example.com/");
  });

  it("trims whitespace", () => {
    expect(linkIfHttpUrl("  https://example.com/  ")).toBe(
      "https://example.com/",
    );
  });

  it("rejects javascript:", () => {
    expect(linkIfHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects other schemes", () => {
    expect(linkIfHttpUrl("ftp://example.com")).toBeNull();
    expect(linkIfHttpUrl("data:text/html,hi")).toBeNull();
  });

  it("rejects plain text", () => {
    expect(linkIfHttpUrl("Room 4B, 2nd floor")).toBeNull();
  });

  it("rejects empty/null/undefined", () => {
    expect(linkIfHttpUrl("")).toBeNull();
    expect(linkIfHttpUrl("   ")).toBeNull();
    expect(linkIfHttpUrl(null)).toBeNull();
    expect(linkIfHttpUrl(undefined)).toBeNull();
  });
});

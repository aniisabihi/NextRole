import { describe, expect, it } from "vitest";
import {
  ensureDummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "../../src/modules/auth/password.js";

describe("password", () => {
  it("hashPassword produces a hash different from plaintext", async () => {
    const plain = "correct-horse-battery-staple";
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
    expect(hash.length).toBeGreaterThan(plain.length);
  });

  it("verifyPassword returns true for matching password", async () => {
    const plain = "secret-password-123";
    const hash = await hashPassword(plain);
    expect(await verifyPassword(hash, plain)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const hash = await hashPassword("right-password");
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("verifyPassword returns false for invalid hash", async () => {
    expect(await verifyPassword("not-a-valid-hash", "anything")).toBe(false);
  });

  it("ensureDummyPasswordHash returns a stable cached hash", async () => {
    const first = await ensureDummyPasswordHash();
    const second = await ensureDummyPasswordHash();
    expect(first).toBe(second);
    expect(first).not.toBe("dummy-password-not-a-user");
  });
});

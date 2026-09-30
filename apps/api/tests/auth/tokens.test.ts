import { describe, expect, it } from "vitest";
import {
  generateRefreshTokenRaw,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../../src/modules/auth/tokens.js";

describe("tokens", () => {
  it("signAccessToken and verifyAccessToken round-trip user id", async () => {
    const userId = "user-550e8400-e29b-41d4-a716-446655440000";
    const token = await signAccessToken(userId);
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe(userId);
  });

  it("generateRefreshTokenRaw produces a string longer than 40 characters", () => {
    const raw = generateRefreshTokenRaw();
    expect(raw.length).toBeGreaterThan(40);
  });

  it("hashRefreshToken is deterministic for the same raw token", () => {
    const raw = "fixed-raw-token-for-hash-test";
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
  });

  it("hashRefreshToken differs for different raw tokens", () => {
    const a = hashRefreshToken("raw-a");
    const b = hashRefreshToken("raw-b");
    expect(a).not.toBe(b);
  });
});

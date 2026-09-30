import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { loadEnv } from "../../config/env.js";

function accessSecret(): Uint8Array {
  return new TextEncoder().encode(loadEnv().JWT_ACCESS_SECRET);
}

export async function signAccessToken(userId: string): Promise<string> {
  const env = loadEnv();
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret());
}

export async function verifyAccessToken(
  token: string,
): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, accessSecret());
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Invalid token subject");
  }
  return { sub: payload.sub };
}

export function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(raw: string): string {
  const pepper = loadEnv().REFRESH_TOKEN_PEPPER;
  return createHash("sha256")
    .update(pepper, "utf8")
    .update(raw, "utf8")
    .digest("hex");
}

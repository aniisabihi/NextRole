import argon2 from "argon2";
import { loadEnv } from "../../config/env.js";

export async function hashPassword(plain: string): Promise<string> {
  const env = loadEnv();
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM,
  });
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyCache: string | null = null;
export async function ensureDummyPasswordHash(): Promise<string> {
  if (!dummyCache) {
    dummyCache = await hashPassword("dummy-password-not-a-user");
  }
  return dummyCache;
}

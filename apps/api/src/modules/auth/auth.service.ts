import type { FastifyReply } from "fastify";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { clearAuthCookies, setAuthCookies } from "./cookies.js";
import { createCsrfToken } from "./csrf.js";
import {
  ensureDummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "./password.js";
import {
  type LoginBody,
  type RegisterBody,
  type UserDto,
  normalizeEmail,
  toUserDto,
} from "./schemas.js";
import {
  createSession,
  revokeSessionByRaw,
  rotateSession,
} from "./sessions.js";
import { signAccessToken } from "./tokens.js";

export async function register(
  reply: FastifyReply,
  input: RegisterBody,
): Promise<UserDto> {
  const email = normalizeEmail(input.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("EMAIL_TAKEN", 409, "Email already registered");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: input.name,
    },
  });

  const { raw: refresh } = await createSession(user.id);
  const access = await signAccessToken(user.id);
  const csrf = createCsrfToken();
  setAuthCookies(reply, { access, refresh, csrf });

  return toUserDto(user);
}

export async function login(
  reply: FastifyReply,
  input: LoginBody,
): Promise<UserDto> {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyPassword(await ensureDummyPasswordHash(), input.password);
    throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
  }

  const { raw: refresh } = await createSession(user.id);
  const access = await signAccessToken(user.id);
  const csrf = createCsrfToken();
  setAuthCookies(reply, { access, refresh, csrf });

  return toUserDto(user);
}

export async function logout(
  reply: FastifyReply,
  refreshRaw: string | undefined,
): Promise<void> {
  if (!refreshRaw) {
    throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
  }
  await revokeSessionByRaw(refreshRaw);
  clearAuthCookies(reply);
}

export async function refresh(
  reply: FastifyReply,
  refreshRaw: string | undefined,
  existingCsrf: string | undefined,
): Promise<void> {
  if (!refreshRaw) {
    clearAuthCookies(reply);
    throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
  }

  try {
    const { raw, userId } = await rotateSession(refreshRaw);
    const access = await signAccessToken(userId);
    // Keep request CSRF — do not mint a new token on refresh (avoids racing parallel POSTs).
    setAuthCookies(reply, { access, refresh: raw, csrf: existingCsrf! });
  } catch (err) {
    clearAuthCookies(reply);
    throw err;
  }
}

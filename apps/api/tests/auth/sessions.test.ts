import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../src/shared/errors/app-error.js";
import { prisma } from "../../src/db/prisma.js";
import { hashRefreshToken } from "../../src/modules/auth/tokens.js";
import {
  createSession,
  revokeAllSessions,
  revokeSessionByRaw,
  rotateSession,
} from "../../src/modules/auth/sessions.js";
import { createTestUser, resetDb } from "../helpers/db.js";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("sessions", () => {
  it("createSession persists hashed refresh token and returns raw", async () => {
    const user = await createTestUser();
    const { raw } = await createSession(user.id);

    expect(raw.length).toBeGreaterThan(40);
    const row = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(raw) },
    });
    expect(row.userId).toBe(user.id);
    expect(row.revokedAt).toBeNull();
    expect(row.familyId).toBeTruthy();
    expect(row.replacedByTokenId).toBeNull();
  });

  it("rotateSession happy path: A→B, A revoked with replacedBy, B rotates", async () => {
    const user = await createTestUser();
    const { raw: a } = await createSession(user.id);

    const { raw: b, userId } = await rotateSession(a);
    expect(userId).toBe(user.id);
    expect(b).not.toBe(a);

    const aRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(a) },
    });
    const bRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(b) },
    });
    expect(aRow.revokedAt).not.toBeNull();
    expect(aRow.replacedByTokenId).toBe(bRow.id);
    expect(bRow.revokedAt).toBeNull();
    expect(bRow.familyId).toBe(aRow.familyId);

    const { raw: c } = await rotateSession(b);
    expect(c).not.toBe(b);
  });

  it("reuse A within grace walks tip and mints successor without killing family", async () => {
    const user = await createTestUser();
    const { raw: a } = await createSession(user.id);
    const { raw: b } = await rotateSession(a);

    const { raw: graceRaw, userId } = await rotateSession(a);
    expect(userId).toBe(user.id);
    expect(graceRaw).not.toBe(a);
    expect(graceRaw).not.toBe(b);

    const familyRows = await prisma.refreshToken.findMany({
      where: { tokenHash: hashRefreshToken(a) },
    });
    const aRow = familyRows[0]!;
    const active = await prisma.refreshToken.findMany({
      where: { familyId: aRow.familyId, revokedAt: null },
    });
    expect(active).toHaveLength(1);
    expect(active[0]!.tokenHash).toBe(hashRefreshToken(graceRaw));
  });

  it("reuse A after grace revokes family and throws AUTH_REUSE_DETECTED", async () => {
    const user = await createTestUser();
    const { raw: a } = await createSession(user.id);
    const { raw: b } = await rotateSession(a);

    const aRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(a) },
    });
    await prisma.refreshToken.update({
      where: { id: aRow.id },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    try {
      await rotateSession(a);
      expect.unreachable("expected AUTH_REUSE_DETECTED");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.code).toBe("AUTH_REUSE_DETECTED");
      expect(e.statusCode).toBe(401);
    }

    const tip = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(b) },
    });
    expect(tip.revokedAt).not.toBeNull();

    const active = await prisma.refreshToken.count({
      where: { familyId: aRow.familyId, revokedAt: null },
    });
    expect(active).toBe(0);
  });

  it("unknown raw throws UNAUTHORIZED", async () => {
    try {
      await rotateSession("not-a-real-refresh-token-value-xxxxxxxxxxxx");
      expect.unreachable("expected UNAUTHORIZED");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.code).toBe("UNAUTHORIZED");
      expect(e.statusCode).toBe(401);
    }
  });

  it("expired active token throws UNAUTHORIZED", async () => {
    const user = await createTestUser();
    const { raw } = await createSession(user.id);
    await prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    try {
      await rotateSession(raw);
      expect.unreachable("expected UNAUTHORIZED");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("UNAUTHORIZED");
      expect((err as AppError).statusCode).toBe(401);
    }
  });

  it("revokeSessionByRaw revokes current session only", async () => {
    const user = await createTestUser();
    const { raw: a } = await createSession(user.id);
    const { raw: b } = await createSession(user.id);

    await revokeSessionByRaw(a);

    const aRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(a) },
    });
    const bRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(b) },
    });
    expect(aRow.revokedAt).not.toBeNull();
    expect(bRow.revokedAt).toBeNull();
  });

  it("revokeAllSessions revokes every active session for user", async () => {
    const user = await createTestUser();
    const other = await createTestUser("other@example.com");
    const { raw: a } = await createSession(user.id);
    const { raw: b } = await createSession(user.id);
    const { raw: o } = await createSession(other.id);

    await revokeAllSessions(user.id);

    const aRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(a) },
    });
    const bRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(b) },
    });
    const oRow = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(o) },
    });
    expect(aRow.revokedAt).not.toBeNull();
    expect(bRow.revokedAt).not.toBeNull();
    expect(oRow.revokedAt).toBeNull();
  });
});

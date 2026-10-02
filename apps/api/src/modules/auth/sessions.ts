import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { loadEnv } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { generateRefreshTokenRaw, hashRefreshToken } from "./tokens.js";

type Tx = Prisma.TransactionClient;

type RefreshTokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  replacedByTokenId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date;
  createdAt: Date;
};

type RawRefreshTokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  replacedByTokenId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date;
  createdAt: Date;
};

function mapRow(row: RawRefreshTokenRow): RefreshTokenRow {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    replacedByTokenId: row.replacedByTokenId,
    expiresAt: new Date(row.expiresAt),
    revokedAt: row.revokedAt == null ? null : new Date(row.revokedAt),
    lastUsedAt: new Date(row.lastUsedAt),
    createdAt: new Date(row.createdAt),
  };
}

async function selectByHashForUpdate(
  tx: Tx,
  tokenHash: string,
): Promise<RefreshTokenRow | null> {
  const rows = await tx.$queryRaw<RawRefreshTokenRow[]>`
    SELECT * FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
  `;
  const row = rows[0];
  return row ? mapRow(row) : null;
}

async function selectByIdForUpdate(
  tx: Tx,
  id: string,
): Promise<RefreshTokenRow | null> {
  const rows = await tx.$queryRaw<RawRefreshTokenRow[]>`
    SELECT * FROM "RefreshToken" WHERE "id" = ${id} FOR UPDATE
  `;
  const row = rows[0];
  return row ? mapRow(row) : null;
}

async function revokeFamily(
  tx: Tx,
  familyId: string,
  now: Date,
): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: now },
  });
}

async function mintSuccessor(
  tx: Tx,
  parent: RefreshTokenRow,
  now: Date,
): Promise<string> {
  const env = loadEnv();
  const raw = generateRefreshTokenRaw();
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(
    now.getTime() + env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  );

  const successor = await tx.refreshToken.create({
    data: {
      userId: parent.userId,
      tokenHash,
      familyId: parent.familyId,
      expiresAt,
      lastUsedAt: now,
    },
  });

  await tx.refreshToken.update({
    where: { id: parent.id },
    data: {
      revokedAt: now,
      replacedByTokenId: successor.id,
    },
  });

  return raw;
}

async function walkToTip(tx: Tx, startId: string): Promise<RefreshTokenRow> {
  let current = await selectByIdForUpdate(tx, startId);
  while (current?.revokedAt != null && current.replacedByTokenId) {
    current = await selectByIdForUpdate(tx, current.replacedByTokenId);
  }
  if (!current || current.revokedAt != null) {
    throw new Error("TIP_UNAVAILABLE");
  }
  return current;
}

export async function createSession(userId: string): Promise<{ raw: string }> {
  const env = loadEnv();
  const now = new Date();
  const raw = generateRefreshTokenRaw();
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(
    now.getTime() + env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  );

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      familyId: randomUUID(),
      expiresAt,
      lastUsedAt: now,
    },
  });

  return { raw };
}

type RotateOutcome =
  | { kind: "ok"; raw: string; userId: string }
  | { kind: "unauthorized" }
  | { kind: "reuse" };

export async function rotateSession(
  raw: string,
): Promise<{ raw: string; userId: string }> {
  const env = loadEnv();
  const tokenHash = hashRefreshToken(raw);
  const now = new Date();
  const graceMs = env.REFRESH_REUSE_GRACE_MS;

  // Commit family revoke before throwing — AppError inside $transaction rolls back.
  const outcome = await prisma.$transaction(
    async (tx: Tx): Promise<RotateOutcome> => {
      const row = await selectByHashForUpdate(tx, tokenHash);

      if (!row) {
        return { kind: "unauthorized" };
      }

      const inGrace =
        row.revokedAt != null &&
        row.replacedByTokenId != null &&
        now.getTime() - row.revokedAt.getTime() <= graceMs;

      if (row.expiresAt.getTime() <= now.getTime() && !inGrace) {
        return { kind: "unauthorized" };
      }

      if (row.revokedAt != null) {
        if (inGrace) {
          try {
            const tip = await walkToTip(tx, row.replacedByTokenId!);
            const newRaw = await mintSuccessor(tx, tip, now);
            return { kind: "ok", raw: newRaw, userId: tip.userId };
          } catch {
            await revokeFamily(tx, row.familyId, now);
            return { kind: "reuse" };
          }
        }

        await revokeFamily(tx, row.familyId, now);
        return { kind: "reuse" };
      }

      const newRaw = await mintSuccessor(tx, row, now);
      return { kind: "ok", raw: newRaw, userId: row.userId };
    },
  );

  if (outcome.kind === "unauthorized") {
    throw new AppError("UNAUTHORIZED", 401, "Please sign in to continue.");
  }
  if (outcome.kind === "reuse") {
    throw new AppError(
      "AUTH_REUSE_DETECTED",
      401,
      "Your session was ended for security. Please sign in again.",
    );
  }
  return { raw: outcome.raw, userId: outcome.userId };
}

export async function revokeSessionByRaw(raw: string): Promise<void> {
  const tokenHash = hashRefreshToken(raw);
  const now = new Date();
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const now = new Date();
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
}

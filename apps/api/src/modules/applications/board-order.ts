import type { ApplicationStatus, Priority, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Serialize board-order / cell membership writes for one (user, status, priority). */
export async function lockBoardCell(
  tx: Tx,
  userId: string,
  status: ApplicationStatus,
  priority: Priority,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${status}:${priority}`}))
  `;
}

export async function nextBoardOrderInCell(
  tx: Tx,
  userId: string,
  status: ApplicationStatus,
  priority: Priority,
): Promise<number> {
  await lockBoardCell(tx, userId, status, priority);
  const agg = await tx.application.aggregate({
    where: { userId, status, priority },
    _max: { boardOrder: true },
  });
  const max = agg._max.boardOrder;
  return max == null ? 0 : max + 1;
}

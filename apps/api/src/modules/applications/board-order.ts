import type { ApplicationStatus, Priority, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function nextBoardOrderInCell(
  tx: Tx,
  userId: string,
  status: ApplicationStatus,
  priority: Priority,
): Promise<number> {
  const agg = await tx.application.aggregate({
    where: { userId, status, priority },
    _max: { boardOrder: true },
  });
  const max = agg._max.boardOrder;
  return max == null ? 0 : max + 1;
}

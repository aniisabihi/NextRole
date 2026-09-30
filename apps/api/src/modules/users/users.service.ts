import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserDto } from "../auth/schemas.js";
import { toUserDto } from "../auth/schemas.js";

export async function getMe(userId: string): Promise<UserDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
  }

  return toUserDto(user);
}

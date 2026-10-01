import { prisma } from "../../src/db/prisma.js";

export async function resetDb(): Promise<void> {
  await prisma.reminder.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.application.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(
  email = "user@example.com",
): Promise<{ id: string }> {
  const { hashPassword } = await import("../../src/modules/auth/password.js");
  const passwordHash = await hashPassword("password12");
  return prisma.user.create({
    data: { email, passwordHash, name: "Test" },
    select: { id: true },
  });
}

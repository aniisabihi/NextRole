import { prisma } from "../../db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserDto } from "../auth/schemas.js";
import { toUserDto } from "../auth/schemas.js";
import {
  flushReminderEffects,
  newReminderEffects,
  rescheduleAutoRemindersForPrefs,
} from "../reminders/reminder-hooks.js";
import type { ReminderPrefsDto, UpdateReminderPrefsBody } from "./schemas.js";

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
    throw new AppError("UNAUTHORIZED", 401, "Please sign in to continue.");
  }

  return toUserDto(user);
}

const prefsSelect = { interviewLeadHours: true, followUpDays: true } as const;

export async function getReminderPrefs(
  userId: string,
): Promise<ReminderPrefsDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: prefsSelect,
  });
  if (!user) throw new AppError("UNAUTHORIZED", 401, "Please sign in to continue.");
  return user;
}

/**
 * Save prefs; only when a value actually changed. Open SCHEDULED auto reminders
 * of the changed kind(s) are rescheduled in the same tx; queue work runs post-commit.
 */
export async function updateReminderPrefs(
  userId: string,
  patch: UpdateReminderPrefsBody,
): Promise<ReminderPrefsDto> {
  const effects = newReminderEffects();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: prefsSelect,
    });
    if (!current) throw new AppError("UNAUTHORIZED", 401, "Please sign in to continue.");

    const changed: UpdateReminderPrefsBody = {};
    if (
      patch.interviewLeadHours !== undefined &&
      patch.interviewLeadHours !== current.interviewLeadHours
    ) {
      changed.interviewLeadHours = patch.interviewLeadHours;
    }
    if (
      patch.followUpDays !== undefined &&
      patch.followUpDays !== current.followUpDays
    ) {
      changed.followUpDays = patch.followUpDays;
    }
    if (Object.keys(changed).length === 0) return current;

    const updated = await tx.user.update({
      where: { id: userId },
      data: changed,
      select: prefsSelect,
    });
    await rescheduleAutoRemindersForPrefs(tx, { userId, ...changed }, effects);
    return updated;
  });
  await flushReminderEffects(effects);
  return result;
}

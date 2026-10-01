import { describe, expect, it } from "vitest";
import {
  formatReminderActivity,
  isReminderActivity,
} from "./reminder-activity";
import type { Activity } from "./types";

function act(type: Activity["type"], payload: Activity["payload"]): Activity {
  return {
    id: "a1",
    applicationId: "app1",
    userId: "u1",
    type,
    payload,
    createdAt: "2026-10-01T10:00:00.000Z",
  };
}

describe("reminder activity", () => {
  it("detects reminder types only", () => {
    expect(isReminderActivity(act("REMINDER_FIRED", {}))).toBe(true);
    expect(isReminderActivity(act("REMINDER_DISMISSED", {}))).toBe(true);
    expect(isReminderActivity(act("STATUS_CHANGED", {}))).toBe(false);
  });

  it("formats fired", () => {
    expect(
      formatReminderActivity(
        act("REMINDER_FIRED", {
          reminderId: "r1",
          kind: "FOLLOW_UP",
          title: "Follow up: Acme",
        }),
      ),
    ).toBe("Reminder due: Follow up: Acme");
  });

  it("formats dismissed", () => {
    expect(
      formatReminderActivity(
        act("REMINDER_DISMISSED", {
          reminderId: "r1",
          kind: "MANUAL",
          title: "Ping",
        }),
      ),
    ).toBe("Reminder dismissed: Ping");
  });

  it("falls back when title missing", () => {
    expect(formatReminderActivity(act("REMINDER_FIRED", {}))).toBe(
      "Reminder due",
    );
  });
});

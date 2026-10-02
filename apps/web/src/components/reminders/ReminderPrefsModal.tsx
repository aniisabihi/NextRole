import { useState, type FormEvent, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";
import {
  REMINDER_FOLLOW_UP_DAYS_MAX,
  REMINDER_FOLLOW_UP_DAYS_MIN,
  REMINDER_LEAD_HOURS_MAX,
  REMINDER_LEAD_HOURS_MIN,
  type ReminderPrefs,
} from "../../lib/types";
import { Button } from "../ui/Button";
import { Field, TextInput } from "../ui/Field";
import { InlineError } from "../ui/InlineError";
import { Modal } from "../ui/Modal";

function PrefsForm({
  prefs,
  onClose,
}: {
  prefs: ReminderPrefs;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [leadHours, setLeadHours] = useState(String(prefs.interviewLeadHours));
  const [followUpDays, setFollowUpDays] = useState(String(prefs.followUpDays));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (patch: Partial<ReminderPrefs>) =>
      apiClient<ReminderPrefs>("/api/me/reminder-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reminder-prefs"] }),
        // prefix match: bell + per-application lists (autos rescheduled)
        queryClient.invalidateQueries({ queryKey: ["reminders"] }),
      ]);
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Save failed");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const lead = Number(leadHours);
    const days = Number(followUpDays);
    if (
      !Number.isInteger(lead) ||
      lead < REMINDER_LEAD_HOURS_MIN ||
      lead > REMINDER_LEAD_HOURS_MAX
    ) {
      setError(
        `Interview lead must be a whole number from ${REMINDER_LEAD_HOURS_MIN} to ${REMINDER_LEAD_HOURS_MAX} hours.`,
      );
      return;
    }
    if (
      !Number.isInteger(days) ||
      days < REMINDER_FOLLOW_UP_DAYS_MIN ||
      days > REMINDER_FOLLOW_UP_DAYS_MAX
    ) {
      setError(
        `Follow-up delay must be a whole number from ${REMINDER_FOLLOW_UP_DAYS_MIN} to ${REMINDER_FOLLOW_UP_DAYS_MAX} days.`,
      );
      return;
    }
    const patch: Partial<ReminderPrefs> = {};
    if (lead !== prefs.interviewLeadHours) patch.interviewLeadHours = lead;
    if (days !== prefs.followUpDays) patch.followUpDays = days;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    save.mutate(patch);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <p className="text-sm text-ink-muted">
        Saving reschedules open automatic reminders. Manual reminders are not
        changed.
      </p>
      <Field label="Interview reminder lead (hours before)">
        <TextInput
          type="number"
          inputMode="numeric"
          min={REMINDER_LEAD_HOURS_MIN}
          max={REMINDER_LEAD_HOURS_MAX}
          step={1}
          required
          value={leadHours}
          onChange={(e) => setLeadHours(e.target.value)}
        />
      </Field>
      <Field label="Follow-up reminder delay (days in Applied / Screening)">
        <TextInput
          type="number"
          inputMode="numeric"
          min={REMINDER_FOLLOW_UP_DAYS_MIN}
          max={REMINDER_FOLLOW_UP_DAYS_MAX}
          step={1}
          required
          value={followUpDays}
          onChange={(e) => setFollowUpDays(e.target.value)}
        />
      </Field>
      {error ? <InlineError>{error}</InlineError> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function ReminderPrefsModal({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const prefsQuery = useQuery({
    queryKey: ["reminder-prefs"],
    queryFn: () => apiClient<ReminderPrefs>("/api/me/reminder-prefs"),
  });

  return (
    <Modal
      title="Reminder settings"
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    >
      {prefsQuery.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : prefsQuery.isError ? (
        <InlineError>Could not load settings.</InlineError>
      ) : (
        <PrefsForm prefs={prefsQuery.data} onClose={onClose} />
      )}
    </Modal>
  );
}

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";
import {
  fromDatetimeLocal,
  toDatetimeLocal,
} from "../../lib/interview-datetime";
import { reminderKindLabel, reminderStatusLabel } from "../../lib/labels";
import { formatReminderDue } from "../../lib/reminder-format";
import type { Reminder, ReminderListResponse } from "../../lib/types";
import { Button } from "../ui/Button";
import { Field, TextInput, TextTextarea } from "../ui/Field";
import { InlineError } from "../ui/InlineError";
import { Surface } from "../ui/Surface";

type Panel = "closed" | "create" | { edit: Reminder };

type FormState = { title: string; body: string; dueAt: string };

const EMPTY_FORM: FormState = { title: "", body: "", dueAt: "" };

function formFromReminder(r: Reminder): FormState {
  return {
    title: r.title,
    body: r.body ?? "",
    dueAt: toDatetimeLocal(r.dueAt),
  };
}

function isOpen(r: Reminder): boolean {
  return r.status === "SCHEDULED" || r.status === "DUE";
}

function ReminderForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (v: { title: string; body: string | null; dueAt: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const title = form.title.trim();
    if (!title) {
      setLocalError("Title is required.");
      return;
    }
    let dueAt: string;
    try {
      dueAt = fromDatetimeLocal(form.dueAt);
    } catch {
      setLocalError("Pick a due date and time.");
      return;
    }
    if (new Date(dueAt).getTime() <= Date.now()) {
      setLocalError("Due time must be in the future.");
      return;
    }
    const body = form.body.trim();
    onSubmit({ title, body: body ? body : null, dueAt });
  }

  const shownError = localError ?? error;

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border/60 bg-paper/40 p-4"
      noValidate
    >
      <Field label="Title">
        <TextInput
          required
          maxLength={200}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </Field>
      <Field label="Due">
        <TextInput
          type="datetime-local"
          required
          value={form.dueAt}
          onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
        />
      </Field>
      <Field label="Note (optional)">
        <TextTextarea
          rows={3}
          maxLength={2000}
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
      </Field>
      {shownError ? <InlineError>{shownError}</InlineError> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function RemindersSection({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>("closed");
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["reminders", applicationId],
    queryFn: () =>
      apiClient<ReminderListResponse>(
        `/api/reminders?applicationId=${encodeURIComponent(applicationId)}&status=DUE,SCHEDULED&limit=50`,
      ),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["reminders"] }),
      queryClient.invalidateQueries({
        queryKey: ["application-activities", applicationId],
      }),
    ]);
  }

  const create = useMutation({
    mutationFn: (v: { title: string; body: string | null; dueAt: string }) =>
      apiClient<Reminder>(`/api/applications/${applicationId}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      }),
    onSuccess: async () => {
      setError(null);
      setPanel("closed");
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      title: string;
      body: string | null;
      dueAt: string;
    }) =>
      apiClient<Reminder>(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: async () => {
      setError(null);
      setPanel("closed");
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) =>
      apiClient<Reminder>(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISMISSED" }),
      }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/reminders/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  function confirmRemove(id: string) {
    if (remove.isPending) return;
    if (!window.confirm("Delete this reminder? This cannot be undone.")) return;
    setError(null);
    remove.mutate(id);
  }

  const items = (query.data?.items ?? []).filter(isOpen);
  const busy = dismiss.isPending || remove.isPending;

  return (
    <Surface as="section" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Reminders
        </h2>
        {panel === "closed" ? (
          <Button
            type="button"
            variant="tonal"
            onClick={() => {
              setError(null);
              setPanel("create");
            }}
          >
            Add reminder
          </Button>
        ) : null}
      </div>

      {panel === "create" ? (
        <ReminderForm
          initial={EMPTY_FORM}
          submitLabel="Add reminder"
          pending={create.isPending}
          error={error}
          onSubmit={(v) => create.mutate(v)}
          onCancel={() => setPanel("closed")}
        />
      ) : null}

      {query.isLoading ? (
        <p className="text-sm text-ink-muted">Loading reminders…</p>
      ) : query.isError ? (
        <InlineError>Could not load reminders.</InlineError>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">No open reminders.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((r) => {
            const editing = typeof panel === "object" && panel.edit.id === r.id;
            // Edit only MANUAL + SCHEDULED; DUE rows never get an edit form.
            // API enforces the same (and future-only dueAt) on PATCH.
            const canEdit = r.kind === "MANUAL" && r.status === "SCHEDULED";
            return (
              <li
                key={r.id}
                className="rounded-[var(--radius-control)] border border-border/60 border-l-4 border-l-accent/60 bg-paper/40 px-4 py-3"
              >
                {editing ? (
                  <ReminderForm
                    initial={formFromReminder(r)}
                    submitLabel="Save"
                    pending={update.isPending}
                    error={error}
                    onSubmit={(v) => update.mutate({ id: r.id, ...v })}
                    onCancel={() => setPanel("closed")}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="text-sm font-semibold text-ink">
                        {r.title}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {reminderKindLabel(r.kind)} ·{" "}
                        {reminderStatusLabel(r.status)} ·{" "}
                        {formatReminderDue(r.dueAt)}
                      </p>
                      {r.body ? (
                        <p className="whitespace-pre-wrap text-sm text-ink-muted">
                          {r.body}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setError(null);
                            setPanel({ edit: r });
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="tonal"
                        disabled={busy}
                        aria-label={`Dismiss reminder: ${r.title}`}
                        onClick={() => dismiss.mutate(r.id)}
                      >
                        Dismiss
                      </Button>
                      {r.kind === "MANUAL" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Delete reminder: ${r.title}`}
                          onClick={() => confirmRemove(r.id)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && panel === "closed" ? <InlineError>{error}</InlineError> : null}
    </Surface>
  );
}

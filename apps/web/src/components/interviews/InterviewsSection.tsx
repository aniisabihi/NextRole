import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";
import {
  fromDatetimeLocal,
  toDatetimeLocal,
} from "../../lib/interview-datetime";
import { groupInterviews } from "../../lib/interview-group";
import {
  buildInterviewPatch,
  type InterviewFormState,
} from "../../lib/interview-patch";
import { canTransitionInterviewStatus } from "../../lib/interview-status-transitions";
import { linkIfHttpUrl } from "../../lib/interview-url";
import {
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  type Interview,
  type InterviewListResponse,
  type InterviewResponse,
  type InterviewStatus,
  type InterviewType,
} from "../../lib/types";

const BTN =
  "min-h-[44px] rounded border border-neutral-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-50";
const BTN_PRIMARY =
  "min-h-[44px] rounded bg-neutral-900 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-50";
const INPUT =
  "rounded border border-neutral-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

const TERMINAL_ACTIONS: { status: InterviewStatus; label: string }[] = [
  { status: "COMPLETED", label: "Mark completed" },
  { status: "CANCELLED", label: "Cancel interview" },
  { status: "NO_SHOW", label: "Mark no-show" },
];

type Panel = "closed" | "create" | { edit: Interview };

type PendingFocus =
  { kind: "add" } | { kind: "edit"; id: string } | { kind: "heading" } | null;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function typeText(i: Interview): string {
  if (i.type === "OTHER" && i.typeLabel) return i.typeLabel;
  return INTERVIEW_TYPE_LABELS[i.type];
}

function isTerminal(i: Interview): boolean {
  return i.status !== "SCHEDULED";
}

/** Base description per interview; disambiguate collisions with an ordinal. */
function buildDescriptions(items: Interview[]): Map<string, string> {
  const base = items.map((i) => {
    const parts = [formatWhen(i.scheduledAt), typeText(i)];
    return { id: i.id, text: parts.join(", ") };
  });
  const counts = new Map<string, number>();
  for (const b of base) counts.set(b.text, (counts.get(b.text) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const b of base) {
    if ((counts.get(b.text) ?? 0) > 1) {
      const n = (seen.get(b.text) ?? 0) + 1;
      seen.set(b.text, n);
      out.set(b.id, `${b.text} (${n} of ${counts.get(b.text)})`);
    } else {
      out.set(b.id, b.text);
    }
  }
  return out;
}

function emptyForm(): InterviewFormState {
  return {
    scheduledAtLocal: "",
    type: "PHONE",
    typeLabel: "",
    interviewer: "",
    locationOrUrl: "",
    notes: "",
  };
}

function formFromInterview(i: Interview): InterviewFormState {
  return {
    scheduledAtLocal: toDatetimeLocal(i.scheduledAt),
    type: i.type,
    typeLabel: i.typeLabel ?? "",
    interviewer: i.interviewer ?? "",
    locationOrUrl: i.locationOrUrl ?? "",
    notes: i.notes ?? "",
  };
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function LocationOrUrl({ value }: { value: string }) {
  const href = linkIfHttpUrl(value);
  if (!href) return <span>{value}</span>;
  return (
    <a
      className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {value}
    </a>
  );
}

function InterviewForm({
  mode,
  interview,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  interview?: Interview;
  pending: boolean;
  error: string | null;
  onSubmit: (form: InterviewFormState) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const terminal = interview ? isTerminal(interview) : false;
  const [form, setForm] = useState<InterviewFormState>(() =>
    interview ? formFromInterview(interview) : emptyForm(),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function set<K extends keyof InterviewFormState>(
    key: K,
    value: InterviewFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!terminal) {
      if (!form.scheduledAtLocal) {
        setLocalError("Date and time are required.");
        return;
      }
      if (form.type === "OTHER" && form.typeLabel.trim() === "") {
        setLocalError("Type label is required when type is Other.");
        return;
      }
    }
    onSubmit(form);
  }

  const shownError = localError ?? error;
  const heading = mode === "create" ? "Add interview" : "Edit interview";

  return (
    <form
      className="flex flex-col gap-3 rounded border border-neutral-300 p-3"
      aria-label={heading}
      onSubmit={handleSubmit}
    >
      <p className="text-sm font-medium">{heading}</p>
      {terminal ? (
        <p className="text-sm text-neutral-600">
          This interview is {INTERVIEW_STATUS_LABELS[interview!.status]}. Only
          interviewer, location and notes can be edited.
        </p>
      ) : (
        <>
          <label
            className="flex flex-col gap-1 text-sm"
            htmlFor={`${uid}-when`}
          >
            Date and time
            <input
              id={`${uid}-when`}
              ref={firstRef}
              className={INPUT}
              type="datetime-local"
              required
              value={form.scheduledAtLocal}
              onChange={(e) => set("scheduledAtLocal", e.target.value)}
            />
          </label>
          <label
            className="flex flex-col gap-1 text-sm"
            htmlFor={`${uid}-type`}
          >
            Type
            <select
              id={`${uid}-type`}
              className={INPUT}
              value={form.type}
              onChange={(e) => set("type", e.target.value as InterviewType)}
            >
              {INTERVIEW_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INTERVIEW_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          {form.type === "OTHER" ? (
            <label
              className="flex flex-col gap-1 text-sm"
              htmlFor={`${uid}-label`}
            >
              Type label
              <input
                id={`${uid}-label`}
                className={INPUT}
                required
                maxLength={100}
                value={form.typeLabel}
                onChange={(e) => set("typeLabel", e.target.value)}
              />
            </label>
          ) : null}
        </>
      )}
      <label
        className="flex flex-col gap-1 text-sm"
        htmlFor={`${uid}-interviewer`}
      >
        Interviewer
        <input
          id={`${uid}-interviewer`}
          ref={terminal ? firstRef : undefined}
          className={INPUT}
          maxLength={200}
          value={form.interviewer}
          onChange={(e) => set("interviewer", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${uid}-loc`}>
        Location or URL
        <input
          id={`${uid}-loc`}
          className={INPUT}
          maxLength={2000}
          value={form.locationOrUrl}
          onChange={(e) => set("locationOrUrl", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${uid}-notes`}>
        Notes
        <textarea
          id={`${uid}-notes`}
          className={INPUT}
          rows={3}
          maxLength={10000}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </label>
      {shownError ? (
        <p role="alert" className="text-sm text-red-600">
          {shownError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button className={BTN_PRIMARY} type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          className={BTN}
          type="button"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function InterviewsSection({
  applicationId,
}: {
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["application-interviews", applicationId] as const,
    [applicationId],
  );
  const basePath = `/api/applications/${applicationId}/interviews`;

  const [panel, setPanel] = useState<Panel>("closed");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [successAnnounce, setSuccessAnnounce] = useState("");
  const [pendingFocus, setPendingFocus] = useState<PendingFocus>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const editRefs = useRef(new Map<string, HTMLButtonElement>());

  const interviewsQuery = useQuery({
    queryKey,
    queryFn: () => apiClient<InterviewListResponse>(basePath),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: ["application-activities", applicationId],
      }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient<InterviewResponse>(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) =>
      apiClient<InterviewResponse>(`${basePath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`${basePath}/${id}`, { method: "DELETE" }),
  });

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const items = interviewsQuery.data?.items;
  const { upcoming, past } = useMemo(
    () => groupInterviews(items ?? []),
    [items],
  );
  const descriptions = useMemo(() => buildDescriptions(items ?? []), [items]);

  // Focus management after panel close / delete / status change.
  useEffect(() => {
    if (!pendingFocus) return;
    let el: HTMLElement | null | undefined = null;
    if (pendingFocus.kind === "add") el = addRef.current;
    else if (pendingFocus.kind === "edit")
      el = editRefs.current.get(pendingFocus.id) ?? headingRef.current;
    else el = headingRef.current;
    if (el) {
      el.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus, items, panel]);

  function openCreate() {
    setMutationError(null);
    setSuccessAnnounce("");
    setPanel("create");
  }

  function openEdit(i: Interview) {
    setMutationError(null);
    setSuccessAnnounce("");
    setPanel({ edit: i });
  }

  function cancelPanel() {
    const target: PendingFocus =
      typeof panel === "object"
        ? { kind: "edit", id: panel.edit.id }
        : { kind: "add" };
    setMutationError(null);
    setPanel("closed");
    setPendingFocus(target);
  }

  async function submitCreate(form: InterviewFormState) {
    setMutationError(null);
    setSuccessAnnounce("");
    let body: Record<string, unknown>;
    try {
      body = {
        scheduledAt: fromDatetimeLocal(form.scheduledAtLocal),
        type: form.type,
      };
    } catch {
      setMutationError("Invalid date and time.");
      return;
    }
    if (form.type === "OTHER") body.typeLabel = form.typeLabel.trim();
    if (form.interviewer.trim()) body.interviewer = form.interviewer.trim();
    if (form.locationOrUrl.trim()) {
      body.locationOrUrl = form.locationOrUrl.trim();
    }
    if (form.notes.trim()) body.notes = form.notes.trim();
    try {
      await createMutation.mutateAsync(body);
      await invalidate();
      setPanel("closed");
      setPendingFocus({ kind: "add" });
      setSuccessAnnounce("Interview saved");
    } catch (err) {
      setMutationError(errMessage(err, "Could not save interview"));
    }
  }

  async function submitEdit(server: Interview, form: InterviewFormState) {
    setMutationError(null);
    setSuccessAnnounce("");
    let patch: Record<string, unknown>;
    try {
      patch = buildInterviewPatch(server, form, {
        terminal: isTerminal(server),
      });
    } catch {
      setMutationError("Invalid date and time.");
      return;
    }
    if (Object.keys(patch).length === 0) {
      setMutationError("No changes to save");
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: server.id, patch });
      await invalidate();
      setPanel("closed");
      setPendingFocus({ kind: "edit", id: server.id });
      setSuccessAnnounce("Interview saved");
    } catch (err) {
      setMutationError(errMessage(err, "Could not save interview"));
    }
  }

  async function changeStatus(i: Interview, to: InterviewStatus) {
    if (!canTransitionInterviewStatus(i.status, to) || i.status === to) return;
    const label = INTERVIEW_STATUS_LABELS[to];
    const desc = descriptions.get(i.id) ?? "";
    if (
      !window.confirm(
        `Mark interview (${desc}) as ${label}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setMutationError(null);
    setSuccessAnnounce("");
    try {
      await updateMutation.mutateAsync({ id: i.id, patch: { status: to } });
      await invalidate();
      setPanel((p) =>
        typeof p === "object" && p.edit.id === i.id ? "closed" : p,
      );
      setPendingFocus({ kind: "edit", id: i.id });
      setSuccessAnnounce(`Interview marked ${label}`);
    } catch (err) {
      setMutationError(errMessage(err, "Could not update status"));
    }
  }

  async function deleteInterview(i: Interview) {
    const desc = descriptions.get(i.id) ?? "";
    if (!window.confirm(`Delete interview (${desc})? This cannot be undone.`)) {
      return;
    }
    setMutationError(null);
    setSuccessAnnounce("");
    try {
      await deleteMutation.mutateAsync(i.id);
      await invalidate();
      setPanel((p) =>
        typeof p === "object" && p.edit.id === i.id ? "closed" : p,
      );
      setPendingFocus({ kind: "heading" });
      setSuccessAnnounce("Interview deleted");
    } catch (err) {
      setMutationError(errMessage(err, "Could not delete interview"));
    }
  }

  function renderRow(i: Interview) {
    const desc = descriptions.get(i.id) ?? "";
    const editing = typeof panel === "object" && panel.edit.id === i.id;
    return (
      <li
        key={i.id}
        className="flex flex-col gap-2 rounded border border-neutral-200 p-3"
      >
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            {formatWhen(i.scheduledAt)} · {typeText(i)} ·{" "}
            <span>{INTERVIEW_STATUS_LABELS[i.status]}</span>
          </p>
          {i.interviewer ? (
            <p className="text-neutral-700">Interviewer: {i.interviewer}</p>
          ) : null}
          {i.locationOrUrl ? (
            <p className="break-words text-neutral-700">
              Location: <LocationOrUrl value={i.locationOrUrl} />
            </p>
          ) : null}
          {i.notes ? (
            <p className="whitespace-pre-wrap text-neutral-700">{i.notes}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            ref={(el) => {
              if (el) editRefs.current.set(i.id, el);
              else editRefs.current.delete(i.id);
            }}
            className={BTN}
            type="button"
            aria-label={`Edit interview, ${desc}`}
            aria-expanded={editing}
            disabled={busy}
            onClick={() => openEdit(i)}
          >
            Edit
          </button>
          {i.status === "SCHEDULED"
            ? TERMINAL_ACTIONS.map((a) => (
                <button
                  key={a.status}
                  className={BTN}
                  type="button"
                  aria-label={`${a.label}, ${desc}`}
                  disabled={busy}
                  onClick={() => void changeStatus(i, a.status)}
                >
                  {a.label}
                </button>
              ))
            : null}
          <button
            className={BTN}
            type="button"
            aria-label={`Delete interview, ${desc}`}
            disabled={busy}
            onClick={() => void deleteInterview(i)}
          >
            Delete
          </button>
        </div>
        {editing ? (
          <InterviewForm
            key={`edit-${i.id}`}
            mode="edit"
            interview={(panel as { edit: Interview }).edit}
            pending={updateMutation.isPending}
            error={mutationError}
            onSubmit={(form) => void submitEdit(i, form)}
            onCancel={cancelPanel}
          />
        ) : null}
      </li>
    );
  }

  const total = items?.length ?? 0;

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="interviews-heading"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="interviews-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          Interviews
        </h2>
        <button
          ref={addRef}
          className={BTN}
          type="button"
          aria-expanded={panel === "create"}
          disabled={busy || panel === "create"}
          onClick={openCreate}
        >
          Add interview
        </button>
      </div>

      <div role="status" className="text-sm text-green-700">
        {successAnnounce}
      </div>
      {mutationError && panel === "closed" ? (
        <p role="alert" className="text-sm text-red-600">
          {mutationError}
        </p>
      ) : null}

      {panel === "create" ? (
        <InterviewForm
          key="create"
          mode="create"
          pending={createMutation.isPending}
          error={mutationError}
          onSubmit={(form) => void submitCreate(form)}
          onCancel={cancelPanel}
        />
      ) : null}

      {interviewsQuery.isLoading ? (
        <p className="text-sm text-neutral-600">Loading interviews…</p>
      ) : interviewsQuery.isError ? (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <p className="text-red-600">
            {errMessage(interviewsQuery.error, "Could not load interviews.")}
          </p>
          <button
            className={BTN}
            type="button"
            onClick={() => void interviewsQuery.refetch()}
          >
            Retry
          </button>
        </div>
      ) : total === 0 ? (
        <p className="text-sm text-neutral-600">No interviews yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {upcoming.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Upcoming</h3>
              <ul className="flex flex-col gap-2">{upcoming.map(renderRow)}</ul>
            </div>
          ) : null}
          {past.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Past</h3>
              <ul className="flex flex-col gap-2">{past.map(renderRow)}</ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

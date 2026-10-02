import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Button, ButtonLink } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import {
  Field,
  TextInput,
  TextSelect,
  TextTextarea,
} from "../components/ui/Field";
import { InlineError } from "../components/ui/InlineError";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import { PageHeader } from "../components/ui/PageHeader";
import { Surface } from "../components/ui/Surface";
import {
  employmentTypeLabel,
  enumLabel,
  priorityLabel,
  statusLabel,
  workplaceTypeLabel,
} from "../lib/labels";
import { InterviewsSection } from "../components/interviews/InterviewsSection";
import { apiClient } from "../lib/apiClient";
import {
  formatInterviewActivity,
  isInterviewActivity,
} from "../lib/interview-activity";
import { RemindersSection } from "../components/reminders/RemindersSection";
import {
  formatReminderActivity,
  isReminderActivity,
} from "../lib/reminder-activity";
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPES,
  PRIORITIES,
  WORKPLACE_TYPES,
  type Activity,
  type ActivityListResponse,
  type Application,
  type ApplicationCreatedPayload,
  type ApplicationResponse,
  type ApplicationStatus,
  type FieldsUpdatedPayload,
  type Priority,
  type StatusChangedPayload,
} from "../lib/types";

function toDateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return enumLabel(value);
  return JSON.stringify(value);
}

type FormState = {
  company: string;
  title: string;
  location: string;
  employmentType: string;
  workplaceType: string;
  salary: string;
  jobUrl: string;
  dateDiscovered: string;
  dateApplied: string;
  status: ApplicationStatus;
  priority: Priority;
  notes: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: string;
  resumeVersion: string;
  coverLetterVersion: string;
};

function formFromApplication(app: Application): FormState {
  return {
    company: app.company,
    title: app.title,
    location: app.location ?? "",
    employmentType: app.employmentType ?? "",
    workplaceType: app.workplaceType ?? "",
    salary: app.salary ?? "",
    jobUrl: app.jobUrl ?? "",
    dateDiscovered: toDateInput(app.dateDiscovered),
    dateApplied: toDateInput(app.dateApplied),
    status: app.status,
    priority: app.priority,
    notes: app.notes ?? "",
    contactName: app.contactName ?? "",
    contactEmail: app.contactEmail ?? "",
    contactPhone: app.contactPhone ?? "",
    contactRole: app.contactRole ?? "",
    resumeVersion: app.resumeVersion ?? "",
    coverLetterVersion: app.coverLetterVersion ?? "",
  };
}

function optionalOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function enumOrNull(value: string): string | null {
  return value ? value : null;
}

function buildPatch(
  form: FormState,
  original: Application,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (form.company.trim() !== original.company)
    patch.company = form.company.trim();
  if (form.title.trim() !== original.title) patch.title = form.title.trim();

  const location = optionalOrNull(form.location);
  if (location !== (original.location ?? null)) patch.location = location;

  const employmentType = enumOrNull(form.employmentType);
  if (employmentType !== (original.employmentType ?? null)) {
    patch.employmentType = employmentType;
  }

  const workplaceType = enumOrNull(form.workplaceType);
  if (workplaceType !== (original.workplaceType ?? null)) {
    patch.workplaceType = workplaceType;
  }

  const salary = optionalOrNull(form.salary);
  if (salary !== (original.salary ?? null)) patch.salary = salary;

  const jobUrl = optionalOrNull(form.jobUrl);
  if (jobUrl !== (original.jobUrl ?? null)) patch.jobUrl = jobUrl;

  const dateDiscovered = form.dateDiscovered || null;
  if (dateDiscovered !== (toDateInput(original.dateDiscovered) || null)) {
    patch.dateDiscovered = dateDiscovered;
  }

  const dateApplied = form.dateApplied || null;
  if (dateApplied !== (toDateInput(original.dateApplied) || null)) {
    patch.dateApplied = dateApplied;
  }

  if (form.status !== original.status) patch.status = form.status;
  if (form.priority !== original.priority) patch.priority = form.priority;

  const notes = optionalOrNull(form.notes);
  if (notes !== (original.notes ?? null)) patch.notes = notes;

  const contactName = optionalOrNull(form.contactName);
  if (contactName !== (original.contactName ?? null))
    patch.contactName = contactName;

  const contactEmail = optionalOrNull(form.contactEmail);
  if (contactEmail !== (original.contactEmail ?? null))
    patch.contactEmail = contactEmail;

  const contactPhone = optionalOrNull(form.contactPhone);
  if (contactPhone !== (original.contactPhone ?? null))
    patch.contactPhone = contactPhone;

  const contactRole = optionalOrNull(form.contactRole);
  if (contactRole !== (original.contactRole ?? null))
    patch.contactRole = contactRole;

  const resumeVersion = optionalOrNull(form.resumeVersion);
  if (resumeVersion !== (original.resumeVersion ?? null)) {
    patch.resumeVersion = resumeVersion;
  }

  const coverLetterVersion = optionalOrNull(form.coverLetterVersion);
  if (coverLetterVersion !== (original.coverLetterVersion ?? null)) {
    patch.coverLetterVersion = coverLetterVersion;
  }

  return patch;
}

function ActivityItem({ activity }: { activity: Activity }) {
  const when = formatWhen(activity.createdAt);

  if (activity.type === "APPLICATION_CREATED") {
    const p = activity.payload as ApplicationCreatedPayload;
    return (
      <li className="rounded-[var(--radius-control)] border border-border/60 border-l-4 border-l-accent/60 bg-paper/40 px-4 py-3">
        <p className="text-sm font-semibold text-ink">Created</p>
        <p className="text-sm text-ink-muted">
          {p.company} — {p.title} ({enumLabel(p.status)})
        </p>
        <p className="text-xs text-ink-faint">{when}</p>
      </li>
    );
  }

  if (activity.type === "STATUS_CHANGED") {
    const p = activity.payload as StatusChangedPayload;
    return (
      <li className="rounded-[var(--radius-control)] border border-border/60 border-l-4 border-l-accent/60 bg-paper/40 px-4 py-3">
        <p className="text-sm font-semibold text-ink">Status changed</p>
        <p className="text-sm text-ink-muted">
          {enumLabel(p.from)} → {enumLabel(p.to)}
        </p>
        <p className="text-xs text-ink-faint">{when}</p>
      </li>
    );
  }

  if (activity.type === "FIELDS_UPDATED") {
    const p = activity.payload as FieldsUpdatedPayload;
    const entries = Object.entries(p.fields ?? {});
    return (
      <li className="rounded-[var(--radius-control)] border border-border/60 border-l-4 border-l-accent/60 bg-paper/40 px-4 py-3">
        <p className="text-sm font-semibold text-ink">Fields updated</p>
        <ul className="mt-1 space-y-1 text-sm text-ink-muted">
          {entries.map(([field, diff]) => (
            <li key={field}>
              <span className="font-medium">{field}</span>:{" "}
              {formatDiffValue(diff.from)} → {formatDiffValue(diff.to)}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-faint">{when}</p>
      </li>
    );
  }

  if (isInterviewActivity(activity)) {
    // INTERVIEW_CREATED | INTERVIEW_UPDATED | INTERVIEW_STATUS_CHANGED | INTERVIEW_DELETED
    return (
      <li className="rounded-[var(--radius-control)] border border-border/60 border-l-4 border-l-accent/60 bg-paper/40 px-4 py-3">
        <p className="text-sm font-semibold text-ink">
          {formatInterviewActivity(activity)}
        </p>
        <p className="text-xs text-ink-faint">{when}</p>
      </li>
    );
  }

  if (isReminderActivity(activity)) {
    // REMINDER_FIRED | REMINDER_DISMISSED
    return (
      <li className="rounded-[var(--radius-control)] border border-border/60 border-l-4 border-l-accent/60 bg-paper/40 px-4 py-3">
        <p className="text-sm font-semibold text-ink">
          {formatReminderActivity(activity)}
        </p>
        <p className="text-xs text-ink-faint">{when}</p>
      </li>
    );
  }

  return (
    <li className="rounded-[var(--radius-control)] border border-border/60 border-l-4 border-l-accent/60 bg-paper/40 px-4 py-3">
      <p className="text-sm font-semibold text-ink">{activity.type}</p>
      <p className="text-xs text-ink-faint">{when}</p>
    </li>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    company?: string;
    title?: string;
  }>({});

  useEffect(() => {
    void fetch("/api/auth/csrf", { credentials: "include" });
  }, []);

  const appQuery = useQuery({
    queryKey: ["application", id],
    enabled: Boolean(id),
    queryFn: () => apiClient<ApplicationResponse>(`/api/applications/${id!}`),
  });

  const activitiesQuery = useQuery({
    queryKey: ["application-activities", id],
    enabled: Boolean(id),
    queryFn: () =>
      apiClient<ActivityListResponse>(`/api/applications/${id!}/activities`),
  });

  useEffect(() => {
    if (appQuery.data?.application) {
      setForm(formFromApplication(appQuery.data.application));
    }
  }, [appQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      return apiClient<ApplicationResponse>(`/api/applications/${id!}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    onSuccess: async () => {
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["application", id] }),
        queryClient.invalidateQueries({
          queryKey: ["application-activities", id],
        }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
        queryClient.invalidateQueries({ queryKey: ["reminders"] }),
      ]);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Save failed");
    },
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form || !appQuery.data) return;
    setError(null);
    const nextErrors: { company?: string; title?: string } = {};
    if (!form.company.trim()) nextErrors.company = "Company is required.";
    if (!form.title.trim()) nextErrors.title = "Title is required.";
    setFieldErrors(nextErrors);
    if (nextErrors.company || nextErrors.title) {
      document
        .getElementById(
          nextErrors.company ? "app-detail-company" : "app-detail-title",
        )
        ?.focus();
      return;
    }
    const patch = buildPatch(form, appQuery.data.application);
    if (Object.keys(patch).length === 0) {
      setError("No changes to save");
      return;
    }
    await saveMutation.mutateAsync(patch);
  }

  if (!id) {
    return (
      <AppShell>
        <InlineError>Missing application id.</InlineError>
      </AppShell>
    );
  }

  if (appQuery.isError) {
    return (
      <AppShell>
        <InlineError>
          {appQuery.error instanceof Error
            ? appQuery.error.message
            : "Could not load application."}
        </InlineError>
        <p className="text-sm">
          <Link
            className="font-medium text-accent-hover underline-offset-2 hover:underline"
            to="/applications"
          >
            Back to list
          </Link>
        </p>
      </AppShell>
    );
  }

  if (appQuery.isLoading || !form) {
    return (
      <AppShell>
        <LoadingBlock label="Loading application…" />
      </AppShell>
    );
  }

  const activities = activitiesQuery.data?.items ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Edit application"
        description={`${form.company} — ${form.title}`}
        actions={
          <ButtonLink variant="ghost" to="/applications">
            Back to list
          </ButtonLink>
        }
      />

      <Surface as="form" className="flex flex-col gap-5" onSubmit={onSubmit}>
        <Field label="Company" error={fieldErrors.company}>
          <TextInput
            id="app-detail-company"
            required
            maxLength={200}
            value={form.company}
            onChange={(e) => setField("company", e.target.value)}
          />
        </Field>
        <Field label="Title" error={fieldErrors.title}>
          <TextInput
            id="app-detail-title"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
          />
        </Field>
        <Field label="Location">
          <TextInput
            maxLength={200}
            value={form.location}
            onChange={(e) => setField("location", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employment type">
            <TextSelect
              value={form.employmentType}
              onChange={(e) => setField("employmentType", e.target.value)}
            >
              <option value="">—</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {employmentTypeLabel(t)}
                </option>
              ))}
            </TextSelect>
          </Field>
          <Field label="Workplace type">
            <TextSelect
              value={form.workplaceType}
              onChange={(e) => setField("workplaceType", e.target.value)}
            >
              <option value="">—</option>
              {WORKPLACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {workplaceTypeLabel(t)}
                </option>
              ))}
            </TextSelect>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <TextSelect
              value={form.status}
              onChange={(e) =>
                setField("status", e.target.value as ApplicationStatus)
              }
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </TextSelect>
          </Field>
          <Field label="Priority">
            <TextSelect
              value={form.priority}
              onChange={(e) => setField("priority", e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </TextSelect>
          </Field>
        </div>
        <Field label="Salary">
          <TextInput
            maxLength={100}
            value={form.salary}
            onChange={(e) => setField("salary", e.target.value)}
          />
        </Field>
        <Field label="Job URL">
          <TextInput
            type="url"
            maxLength={2000}
            placeholder="https://"
            value={form.jobUrl}
            onChange={(e) => setField("jobUrl", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date discovered">
            <TextInput
              type="date"
              value={form.dateDiscovered}
              onChange={(e) => setField("dateDiscovered", e.target.value)}
            />
          </Field>
          <Field label="Date applied">
            <TextInput
              type="date"
              value={form.dateApplied}
              onChange={(e) => setField("dateApplied", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes">
          <TextTextarea
            rows={4}
            maxLength={10000}
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />
        </Field>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-display text-base font-semibold text-ink">
            Contact
          </legend>
          <Field label="Name">
            <TextInput
              maxLength={200}
              value={form.contactName}
              onChange={(e) => setField("contactName", e.target.value)}
            />
          </Field>
          <Field label="Role">
            <TextInput
              maxLength={200}
              value={form.contactRole}
              onChange={(e) => setField("contactRole", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              maxLength={255}
              value={form.contactEmail}
              onChange={(e) => setField("contactEmail", e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <TextInput
              maxLength={50}
              value={form.contactPhone}
              onChange={(e) => setField("contactPhone", e.target.value)}
            />
          </Field>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Resume version">
            <TextInput
              maxLength={200}
              value={form.resumeVersion}
              onChange={(e) => setField("resumeVersion", e.target.value)}
            />
          </Field>
          <Field label="Cover letter version">
            <TextInput
              maxLength={200}
              value={form.coverLetterVersion}
              onChange={(e) => setField("coverLetterVersion", e.target.value)}
            />
          </Field>
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <Button type="submit" loading={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </Surface>

      <InterviewsSection applicationId={id} />

      <RemindersSection applicationId={id} />

      <Surface as="section" className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">
          Timeline
        </h2>
        {activitiesQuery.isLoading ? (
          <LoadingBlock label="Loading activities…" />
        ) : activitiesQuery.isError ? (
          <InlineError>Could not load activities.</InlineError>
        ) : activities.length === 0 ? (
          <EmptyState
            headingLevel={3}
            title="No activities yet"
            description="Changes to this application will show up here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {activities.map((a) => (
              <ActivityItem key={a.id} activity={a} />
            ))}
          </ul>
        )}
      </Surface>
    </AppShell>
  );
}

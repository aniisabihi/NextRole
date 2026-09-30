import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { AppNav } from "../components/AppNav";
import { apiClient } from "../lib/apiClient";
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
  if (typeof value === "string") return value;
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

function buildPatch(form: FormState, original: Application): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (form.company.trim() !== original.company) patch.company = form.company.trim();
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
  if (contactName !== (original.contactName ?? null)) patch.contactName = contactName;

  const contactEmail = optionalOrNull(form.contactEmail);
  if (contactEmail !== (original.contactEmail ?? null)) patch.contactEmail = contactEmail;

  const contactPhone = optionalOrNull(form.contactPhone);
  if (contactPhone !== (original.contactPhone ?? null)) patch.contactPhone = contactPhone;

  const contactRole = optionalOrNull(form.contactRole);
  if (contactRole !== (original.contactRole ?? null)) patch.contactRole = contactRole;

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
      <li className="border-l-2 border-neutral-300 pl-3">
        <p className="text-sm font-medium">Created</p>
        <p className="text-sm text-neutral-700">
          {p.company} — {p.title} ({p.status})
        </p>
        <p className="text-xs text-neutral-500">{when}</p>
      </li>
    );
  }

  if (activity.type === "STATUS_CHANGED") {
    const p = activity.payload as StatusChangedPayload;
    return (
      <li className="border-l-2 border-neutral-300 pl-3">
        <p className="text-sm font-medium">Status changed</p>
        <p className="text-sm text-neutral-700">
          {p.from} → {p.to}
        </p>
        <p className="text-xs text-neutral-500">{when}</p>
      </li>
    );
  }

  if (activity.type === "FIELDS_UPDATED") {
    const p = activity.payload as FieldsUpdatedPayload;
    const entries = Object.entries(p.fields ?? {});
    return (
      <li className="border-l-2 border-neutral-300 pl-3">
        <p className="text-sm font-medium">Fields updated</p>
        <ul className="mt-1 space-y-1 text-sm text-neutral-700">
          {entries.map(([field, diff]) => (
            <li key={field}>
              <span className="font-medium">{field}</span>:{" "}
              {formatDiffValue(diff.from)} → {formatDiffValue(diff.to)}
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500">{when}</p>
      </li>
    );
  }

  return (
    <li className="border-l-2 border-neutral-300 pl-3">
      <p className="text-sm font-medium">{activity.type}</p>
      <p className="text-xs text-neutral-500">{when}</p>
    </li>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/csrf", { credentials: "include" });
  }, []);

  const appQuery = useQuery({
    queryKey: ["application", id],
    enabled: Boolean(id),
    queryFn: () =>
      apiClient<ApplicationResponse>(`/api/applications/${id!}`),
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
    const patch = buildPatch(form, appQuery.data.application);
    if (Object.keys(patch).length === 0) {
      setError("No changes to save");
      return;
    }
    await saveMutation.mutateAsync(patch);
  }

  if (!id) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-red-600">Missing application id.</p>
      </main>
    );
  }

  if (appQuery.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <AppNav />
        <p className="text-sm text-red-600">
          {appQuery.error instanceof Error
            ? appQuery.error.message
            : "Could not load application."}
        </p>
        <p className="mt-2 text-sm">
          <Link className="underline" to="/applications">
            Back to list
          </Link>
        </p>
      </main>
    );
  }

  if (appQuery.isLoading || !form) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <AppNav />
        <p className="text-sm text-neutral-600">Loading…</p>
      </main>
    );
  }

  const activities = activitiesQuery.data?.items ?? [];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <AppNav />
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Edit application</h1>
        <Link className="text-sm underline" to="/applications">
          Back to list
        </Link>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          Company
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            required
            maxLength={200}
            value={form.company}
            onChange={(e) => setField("company", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Location
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            maxLength={200}
            value={form.location}
            onChange={(e) => setField("location", e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Employment type
            <select
              className="rounded border border-neutral-300 px-3 py-2"
              value={form.employmentType}
              onChange={(e) => setField("employmentType", e.target.value)}
            >
              <option value="">—</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Workplace type
            <select
              className="rounded border border-neutral-300 px-3 py-2"
              value={form.workplaceType}
              onChange={(e) => setField("workplaceType", e.target.value)}
            >
              <option value="">—</option>
              {WORKPLACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Status
            <select
              className="rounded border border-neutral-300 px-3 py-2"
              value={form.status}
              onChange={(e) =>
                setField("status", e.target.value as ApplicationStatus)
              }
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Priority
            <select
              className="rounded border border-neutral-300 px-3 py-2"
              value={form.priority}
              onChange={(e) =>
                setField("priority", e.target.value as Priority)
              }
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Salary
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            maxLength={100}
            value={form.salary}
            onChange={(e) => setField("salary", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Job URL
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            type="url"
            maxLength={2000}
            placeholder="https://"
            value={form.jobUrl}
            onChange={(e) => setField("jobUrl", e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Date discovered
            <input
              className="rounded border border-neutral-300 px-3 py-2"
              type="date"
              value={form.dateDiscovered}
              onChange={(e) => setField("dateDiscovered", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Date applied
            <input
              className="rounded border border-neutral-300 px-3 py-2"
              type="date"
              value={form.dateApplied}
              onChange={(e) => setField("dateApplied", e.target.value)}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Notes
          <textarea
            className="rounded border border-neutral-300 px-3 py-2"
            rows={4}
            maxLength={10000}
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />
        </label>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Contact</legend>
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              className="rounded border border-neutral-300 px-3 py-2"
              maxLength={200}
              value={form.contactName}
              onChange={(e) => setField("contactName", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <input
              className="rounded border border-neutral-300 px-3 py-2"
              maxLength={200}
              value={form.contactRole}
              onChange={(e) => setField("contactRole", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              className="rounded border border-neutral-300 px-3 py-2"
              type="email"
              maxLength={255}
              value={form.contactEmail}
              onChange={(e) => setField("contactEmail", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Phone
            <input
              className="rounded border border-neutral-300 px-3 py-2"
              maxLength={50}
              value={form.contactPhone}
              onChange={(e) => setField("contactPhone", e.target.value)}
            />
          </label>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Resume version
            <input
              className="rounded border border-neutral-300 px-3 py-2"
              maxLength={200}
              value={form.resumeVersion}
              onChange={(e) => setField("resumeVersion", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Cover letter version
            <input
              className="rounded border border-neutral-300 px-3 py-2"
              maxLength={200}
              value={form.coverLetterVersion}
              onChange={(e) => setField("coverLetterVersion", e.target.value)}
            />
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
          type="submit"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Timeline</h2>
        {activitiesQuery.isLoading ? (
          <p className="text-sm text-neutral-600">Loading activities…</p>
        ) : activitiesQuery.isError ? (
          <p className="text-sm text-red-600">Could not load activities.</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-neutral-600">No activities yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {activities.map((a) => (
              <ActivityItem key={a.id} activity={a} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

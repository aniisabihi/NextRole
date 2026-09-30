import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppNav } from "../components/AppNav";
import { apiClient } from "../lib/apiClient";
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPES,
  PRIORITIES,
  WORKPLACE_TYPES,
  type ApplicationResponse,
  type ApplicationStatus,
  type Priority,
} from "../lib/types";

export function ApplicationNewPage() {
  const navigate = useNavigate();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [workplaceType, setWorkplaceType] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("SAVED");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [jobUrl, setJobUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/csrf", { credentials: "include" });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        company: company.trim(),
        title: title.trim(),
        status,
        priority,
      };
      if (location.trim()) body.location = location.trim();
      if (employmentType) body.employmentType = employmentType;
      if (workplaceType) body.workplaceType = workplaceType;
      if (jobUrl.trim()) body.jobUrl = jobUrl.trim();
      if (notes.trim()) body.notes = notes.trim();

      const res = await apiClient<ApplicationResponse>("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      navigate(`/applications/${res.application.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <AppNav />
      <h1 className="text-2xl font-semibold">New application</h1>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          Company
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            required
            maxLength={200}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Location
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            maxLength={200}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Employment type
          <select
            className="rounded border border-neutral-300 px-3 py-2"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
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
            value={workplaceType}
            onChange={(e) => setWorkplaceType(e.target.value)}
          >
            <option value="">—</option>
            {WORKPLACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            className="rounded border border-neutral-300 px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
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
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Job URL
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            type="url"
            maxLength={2000}
            placeholder="https://"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Notes
          <textarea
            className="rounded border border-neutral-300 px-3 py-2"
            rows={4}
            maxLength={10000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Creating…" : "Create"}
        </button>
      </form>
      <p className="text-sm text-neutral-600">
        <Link className="underline" to="/applications">
          Back to list
        </Link>
      </p>
    </main>
  );
}

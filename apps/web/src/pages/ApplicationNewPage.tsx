import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/ui/Button";
import { Field, TextInput, TextSelect, TextTextarea } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { Surface } from "../components/ui/Surface";
import { apiClient } from "../lib/apiClient";
import { statusLabel } from "../lib/statusColors";
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
    <AppShell>
      <PageHeader
        title="New application"
        description="Capture a role and drop it into your pipeline."
        actions={
          <Link to="/applications">
            <Button variant="ghost" type="button">
              Back to list
            </Button>
          </Link>
        }
      />
      <Surface as="form" className="flex flex-col gap-5" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company">
            <TextInput
              required
              maxLength={200}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </Field>
          <Field label="Title">
            <TextInput
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Location">
          <TextInput
            maxLength={200}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employment type">
            <TextSelect
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
            >
              <option value="">—</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </TextSelect>
          </Field>
          <Field label="Workplace type">
            <TextSelect
              value={workplaceType}
              onChange={(e) => setWorkplaceType(e.target.value)}
            >
              <option value="">—</option>
              {WORKPLACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </TextSelect>
          </Field>
          <Field label="Status">
            <TextSelect
              value={status}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
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
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </TextSelect>
          </Field>
        </div>
        <Field label="Job URL">
          <TextInput
            type="url"
            maxLength={2000}
            placeholder="https://"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <TextTextarea
            rows={4}
            maxLength={10000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-sm text-status-rejected-ink" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create"}
        </Button>
      </Surface>
    </AppShell>
  );
}

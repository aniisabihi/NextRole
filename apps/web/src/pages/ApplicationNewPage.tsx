import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { Button, ButtonLink } from "../components/ui/Button";
import {
  Field,
  TextInput,
  TextSelect,
  TextTextarea,
} from "../components/ui/Field";
import { InlineError } from "../components/ui/InlineError";
import { PageHeader } from "../components/ui/PageHeader";
import { Surface } from "../components/ui/Surface";
import { apiClient, userErrorMessage } from "../lib/apiClient";
import {
  employmentTypeLabel,
  priorityLabel,
  statusLabel,
  workplaceTypeLabel,
} from "../lib/labels";
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
  const queryClient = useQueryClient();
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
  const [fieldErrors, setFieldErrors] = useState<{
    company?: string;
    title?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/csrf", { credentials: "include" });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const nextErrors: { company?: string; title?: string } = {};
    if (!company.trim()) nextErrors.company = "Company is required.";
    if (!title.trim()) nextErrors.title = "Title is required.";
    setFieldErrors(nextErrors);
    if (nextErrors.company || nextErrors.title) {
      document
        .getElementById(
          nextErrors.company ? "app-new-company" : "app-new-title",
        )
        ?.focus();
      return;
    }
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      navigate(`/applications/${res.application.id}`);
    } catch (err) {
      setError(
        userErrorMessage(err, "Couldn’t create the application. Please try again."),
      );
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
          <ButtonLink variant="ghost" to="/applications">
            Back to list
          </ButtonLink>
        }
      />
      <Surface as="form" className="flex flex-col gap-5" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company" error={fieldErrors.company}>
            <TextInput
              id="app-new-company"
              required
              maxLength={200}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </Field>
          <Field label="Title" error={fieldErrors.title}>
            <TextInput
              id="app-new-title"
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
                  {employmentTypeLabel(t)}
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
                  {workplaceTypeLabel(t)}
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
                  {priorityLabel(p)}
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
        {error ? <InlineError>{error}</InlineError> : null}
        <Button type="submit" loading={submitting}>
          {submitting ? "Creating…" : "Create"}
        </Button>
      </Surface>
    </AppShell>
  );
}

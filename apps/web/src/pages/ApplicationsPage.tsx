import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Button, ButtonLink } from "../components/ui/Button";
import { Field, TextInput, TextSelect } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { PriorityChip, StatusChip } from "../components/ui/StatusChip";
import { Surface } from "../components/ui/Surface";
import { apiClient } from "../lib/apiClient";
import { STATUS_EDGE, statusLabel } from "../lib/statusColors";
import {
  APPLICATION_SORT_FIELDS,
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPES,
  PRIORITIES,
  WORKPLACE_TYPES,
  type ApplicationListResponse,
  type ApplicationSortField,
} from "../lib/types";

const PAGE_SIZE = 20;

function buildListPath(params: {
  q: string;
  status: string;
  employmentType: string;
  workplaceType: string;
  priority: string;
  sort: ApplicationSortField;
  order: "asc" | "desc";
  page: number;
}): string {
  const qs = new URLSearchParams();
  if (params.q.trim()) qs.set("q", params.q.trim());
  if (params.status) qs.set("status", params.status);
  if (params.employmentType) qs.set("employmentType", params.employmentType);
  if (params.workplaceType) qs.set("workplaceType", params.workplaceType);
  if (params.priority) qs.set("priority", params.priority);
  qs.set("sort", params.sort);
  qs.set("order", params.order);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(PAGE_SIZE));
  return `/api/applications?${qs.toString()}`;
}

export function ApplicationsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [workplaceType, setWorkplaceType] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState<ApplicationSortField>("updatedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: [
      "applications",
      { q, status, employmentType, workplaceType, priority, sort, order, page },
    ],
    queryFn: () =>
      apiClient<ApplicationListResponse>(
        buildListPath({
          q,
          status,
          employmentType,
          workplaceType,
          priority,
          sort,
          order,
          page,
        }),
      ),
  });

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize))
    : 1;

  function onFilterChange<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  return (
    <AppShell>
      <PageHeader
        title="Applications"
        description="Filter, sort, and open any role in your pipeline."
        actions={
          <ButtonLink to="/applications/new">New application</ButtonLink>
        }
      />

      <Surface className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Search" className="sm:col-span-2 lg:col-span-3">
          <TextInput
            type="search"
            placeholder="Company or title"
            value={q}
            onChange={(e) => onFilterChange(setQ, e.target.value)}
          />
        </Field>
        <Field label="Status">
          <TextSelect
            value={status}
            onChange={(e) => onFilterChange(setStatus, e.target.value)}
          >
            <option value="">Any</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </TextSelect>
        </Field>
        <Field label="Employment">
          <TextSelect
            value={employmentType}
            onChange={(e) => onFilterChange(setEmploymentType, e.target.value)}
          >
            <option value="">Any</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </TextSelect>
        </Field>
        <Field label="Workplace">
          <TextSelect
            value={workplaceType}
            onChange={(e) => onFilterChange(setWorkplaceType, e.target.value)}
          >
            <option value="">Any</option>
            {WORKPLACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </TextSelect>
        </Field>
        <Field label="Priority">
          <TextSelect
            value={priority}
            onChange={(e) => onFilterChange(setPriority, e.target.value)}
          >
            <option value="">Any</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </TextSelect>
        </Field>
        <Field label="Sort">
          <TextSelect
            value={sort}
            onChange={(e) =>
              onFilterChange(setSort, e.target.value as ApplicationSortField)
            }
          >
            {APPLICATION_SORT_FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </TextSelect>
        </Field>
        <Field label="Order">
          <TextSelect
            value={order}
            onChange={(e) =>
              onFilterChange(setOrder, e.target.value as "asc" | "desc")
            }
          >
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </TextSelect>
        </Field>
      </Surface>

      {list.isPending ? <p className="text-ink-muted">Loading…</p> : null}
      {list.isError ? (
        <p className="text-status-rejected-ink">
          {list.error instanceof Error
            ? list.error.message
            : "Could not load applications."}
        </p>
      ) : null}

      {list.data ? (
        <>
          <p className="text-sm text-ink-muted">
            {list.data.total} result{list.data.total === 1 ? "" : "s"}
          </p>
          {list.data.items.length === 0 ? (
            <Surface>
              <p className="text-ink-muted">No applications yet.</p>
            </Surface>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.data.items.map((app) => (
                <li key={app.id}>
                  <Link
                    to={`/applications/${app.id}`}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-border/70 border-l-4 bg-surface/90 px-4 py-3.5 no-underline transition-colors hover:bg-surface ${STATUS_EDGE[app.status]}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">
                        {app.company} — {app.title}
                      </span>
                      <span className="mt-1 block text-sm text-ink-muted">
                        {[app.employmentType, app.workplaceType]
                          .filter(Boolean)
                          .join(" · ") || "Details open on click"}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusChip status={app.status} />
                      <PriorityChip priority={app.priority} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppNav } from "../components/AppNav";
import { apiClient } from "../lib/apiClient";
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
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <AppNav />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <Link
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
          to="/applications/new"
        >
          New application
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Search
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            type="search"
            placeholder="Company or title"
            value={q}
            onChange={(e) => onFilterChange(setQ, e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            className="rounded border border-neutral-300 px-3 py-2"
            value={status}
            onChange={(e) => onFilterChange(setStatus, e.target.value)}
          >
            <option value="">Any</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Employment
          <select
            className="rounded border border-neutral-300 px-3 py-2"
            value={employmentType}
            onChange={(e) => onFilterChange(setEmploymentType, e.target.value)}
          >
            <option value="">Any</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Workplace
          <select
            className="rounded border border-neutral-300 px-3 py-2"
            value={workplaceType}
            onChange={(e) => onFilterChange(setWorkplaceType, e.target.value)}
          >
            <option value="">Any</option>
            {WORKPLACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Priority
          <select
            className="rounded border border-neutral-300 px-3 py-2"
            value={priority}
            onChange={(e) => onFilterChange(setPriority, e.target.value)}
          >
            <option value="">Any</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sort
          <select
            className="rounded border border-neutral-300 px-3 py-2"
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
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Order
          <select
            className="rounded border border-neutral-300 px-3 py-2"
            value={order}
            onChange={(e) =>
              onFilterChange(setOrder, e.target.value as "asc" | "desc")
            }
          >
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </select>
        </label>
      </div>

      {list.isPending ? <p>Loading…</p> : null}
      {list.isError ? (
        <p className="text-red-600">
          {list.error instanceof Error
            ? list.error.message
            : "Could not load applications."}
        </p>
      ) : null}

      {list.data ? (
        <>
          <p className="text-sm text-neutral-500">
            {list.data.total} result{list.data.total === 1 ? "" : "s"}
          </p>
          {list.data.items.length === 0 ? (
            <p className="text-neutral-600">No applications yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.data.items.map((app) => (
                <li key={app.id} className="border-b border-neutral-200 py-2">
                  <Link
                    className="font-medium underline"
                    to={`/applications/${app.id}`}
                  >
                    {app.company} — {app.title}
                  </Link>
                  <p className="text-sm text-neutral-600">
                    {app.status} · {app.priority}
                    {app.employmentType ? ` · ${app.employmentType}` : ""}
                    {app.workplaceType ? ` · ${app.workplaceType}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <button
              className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-50"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-sm text-neutral-600">
              Page {page} of {totalPages}
            </span>
            <button
              className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-50"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}

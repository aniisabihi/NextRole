import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ButtonLink } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { StatusChip } from "../components/ui/StatusChip";
import { Surface } from "../components/ui/Surface";
import { apiClient } from "../lib/apiClient";
import { STATUS_EDGE } from "../lib/statusColors";
import type { ApplicationListResponse, User } from "../lib/types";

export function DashboardPage() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient<User>("/api/me"),
  });

  const recent = useQuery({
    queryKey: [
      "applications",
      { pageSize: 5, sort: "updatedAt", order: "desc" },
    ],
    queryFn: () =>
      apiClient<ApplicationListResponse>(
        "/api/applications?pageSize=5&sort=updatedAt&order=desc&page=1",
      ),
    enabled: me.isSuccess,
  });

  if (me.isPending) {
    return (
      <AppShell>
        <p className="text-ink-muted">Loading…</p>
      </AppShell>
    );
  }

  if (me.isError) {
    return (
      <AppShell>
        <Surface className="flex flex-col gap-3">
          <p className="text-status-rejected-ink">Could not load profile.</p>
          <Link
            className="font-medium text-accent-hover underline-offset-2 hover:underline"
            to="/login"
          >
            Log in
          </Link>
        </Surface>
      </AppShell>
    );
  }

  const user = me.data;
  const greeting = user.name?.trim() || user.email;

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${greeting}`}
        actions={
          <>
            <ButtonLink variant="secondary" to="/applications">
              View applications
            </ButtonLink>
            <ButtonLink to="/applications/new">New application</ButtonLink>
          </>
        }
      />

      <Surface as="section" className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">
          Recent applications
        </h2>
        {recent.isPending ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : null}
        {recent.isError ? (
          <p className="text-sm text-status-rejected-ink">
            Could not load applications.
          </p>
        ) : null}
        {recent.data?.items.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No applications yet. Create your first one to fill the board.
          </p>
        ) : null}
        {recent.data && recent.data.items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {recent.data.items.map((app) => (
              <li key={app.id}>
                <Link
                  to={`/applications/${app.id}`}
                  className={`flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border/60 border-l-4 bg-paper/50 px-4 py-3 no-underline transition-colors hover:bg-paper ${STATUS_EDGE[app.status]}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {app.company}
                    </span>
                    <span className="block truncate text-sm text-ink-muted">
                      {app.title}
                    </span>
                  </span>
                  <StatusChip status={app.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Surface>
    </AppShell>
  );
}

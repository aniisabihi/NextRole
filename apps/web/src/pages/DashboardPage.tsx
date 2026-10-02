import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { InterviewCounts } from "../components/dashboard/InterviewCounts";
import { MonthlyCreatedChart } from "../components/dashboard/MonthlyCreatedChart";
import { StatTiles } from "../components/dashboard/StatTiles";
import { StatusBreakdown } from "../components/dashboard/StatusBreakdown";
import { ButtonLink } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineError } from "../components/ui/InlineError";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import { PageHeader } from "../components/ui/PageHeader";
import { StatusChip } from "../components/ui/StatusChip";
import { Surface } from "../components/ui/Surface";
import { apiClient } from "../lib/apiClient";
import { STATUS_EDGE } from "../lib/statusColors";
import type {
  ApplicationListResponse,
  DashboardStats,
  User,
} from "../lib/types";

export function DashboardPage() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient<User>("/api/me"),
  });

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiClient<DashboardStats>("/api/dashboard/stats"),
    enabled: me.isSuccess,
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
        <LoadingBlock />
      </AppShell>
    );
  }

  if (me.isError) {
    return (
      <AppShell>
        <Surface className="flex flex-col gap-3">
          <InlineError>Could not load profile.</InlineError>
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

      {stats.isPending ? <LoadingBlock label="Loading stats…" /> : null}
      {stats.isError ? (
        <InlineError>Could not load dashboard stats.</InlineError>
      ) : null}
      {stats.data ? (
        <>
          <StatTiles totals={stats.data.totals} rates={stats.data.rates} />
          <StatusBreakdown byStatus={stats.data.byStatus} />
          <MonthlyCreatedChart
            monthlyCreated={stats.data.monthlyCreated}
            isEmpty={stats.data.totals.applications === 0}
          />
          <InterviewCounts interviews={stats.data.interviews} />
        </>
      ) : null}

      <Surface as="section" className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">
          Recent applications
        </h2>
        {recent.isPending ? (
          <LoadingBlock label="Loading recent applications…" />
        ) : null}
        {recent.isError ? (
          <InlineError>Could not load applications.</InlineError>
        ) : null}
        {recent.data?.items.length === 0 ? (
          <EmptyState
            headingLevel={3}
            title="No applications yet"
            description="Create your first one to fill the board."
            action={
              <ButtonLink to="/applications/new">New application</ButtonLink>
            }
          />
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

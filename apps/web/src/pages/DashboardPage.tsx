import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppNav } from "../components/AppNav";
import { apiClient } from "../lib/apiClient";
import type { ApplicationListResponse, User } from "../lib/types";

export function DashboardPage() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient<User>("/api/me"),
  });

  const recent = useQuery({
    queryKey: ["applications", { pageSize: 5, sort: "updatedAt", order: "desc" }],
    queryFn: () =>
      apiClient<ApplicationListResponse>(
        "/api/applications?pageSize=5&sort=updatedAt&order=desc&page=1",
      ),
    enabled: me.isSuccess,
  });

  if (me.isPending) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <p>Loading…</p>
      </main>
    );
  }

  if (me.isError) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <p className="text-red-600">Could not load profile.</p>
        <Link className="underline" to="/login">
          Log in
        </Link>
      </main>
    );
  }

  const user = me.data;

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <AppNav />
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-neutral-700">
        Signed in as <strong>{user.email}</strong>
        {user.name ? ` (${user.name})` : null}
      </p>
      <p className="text-sm text-neutral-500">id: {user.id}</p>
      <p>
        <Link className="underline" to="/applications">
          View applications
        </Link>
        {" · "}
        <Link className="underline" to="/applications/new">
          New application
        </Link>
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Recent applications</h2>
        {recent.isPending ? <p className="text-sm">Loading…</p> : null}
        {recent.isError ? (
          <p className="text-sm text-red-600">Could not load applications.</p>
        ) : null}
        {recent.data?.items.length === 0 ? (
          <p className="text-sm text-neutral-600">No applications yet.</p>
        ) : null}
        {recent.data && recent.data.items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {recent.data.items.map((app) => (
              <li key={app.id} className="text-sm">
                <Link className="underline" to={`/applications/${app.id}`}>
                  {app.company} — {app.title}
                </Link>
                <span className="text-neutral-500"> · {app.status}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}

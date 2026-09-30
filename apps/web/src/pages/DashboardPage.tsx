import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/apiClient";
import type { User } from "../lib/types";

export function DashboardPage() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient<User>("/api/me"),
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
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-neutral-700">
        Signed in as <strong>{user.email}</strong>
        {user.name ? ` (${user.name})` : null}
      </p>
      <p className="text-sm text-neutral-500">id: {user.id}</p>
    </main>
  );
}

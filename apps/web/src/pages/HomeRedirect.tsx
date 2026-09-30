import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiClient } from "../lib/apiClient";
import type { User } from "../lib/types";

export function HomeRedirect() {
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await apiClient<User>("/api/me");
        if (!cancelled) setTo("/dashboard");
      } catch {
        if (!cancelled) setTo("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!to) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <p>Loading…</p>
      </main>
    );
  }

  return <Navigate to={to} replace />;
}

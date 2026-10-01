import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Field, TextInput } from "../components/ui/Field";
import { Surface } from "../components/ui/Surface";
import { apiClient } from "../lib/apiClient";
import type { AuthResponse } from "../lib/types";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      await apiClient<AuthResponse>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="auth-fade-in flex w-full max-w-md flex-col gap-8">
        <div className="text-center">
          <p className="font-display text-5xl font-semibold tracking-tight text-ink">
            NextRole
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Track every application with calm color and clarity.
          </p>
        </div>
        <Surface as="form" className="flex flex-col gap-5" onSubmit={onSubmit}>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Log in
          </h1>
          <Field label="Email">
            <TextInput
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error ? (
            <p className="text-sm text-status-rejected-ink" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-ink-muted">
            No account?{" "}
            <Link
              className="font-medium text-accent-hover underline-offset-2 hover:underline"
              to="/register"
            >
              Register
            </Link>
          </p>
        </Surface>
      </div>
    </main>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Field, TextInput } from "../components/ui/Field";
import { InlineError } from "../components/ui/InlineError";
import { Surface } from "../components/ui/Surface";
import { apiClient } from "../lib/apiClient";
import type { AuthResponse } from "../lib/types";

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
      await apiClient<AuthResponse>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(name.trim() ? { name: name.trim() } : {}),
        }),
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
            Start tracking your search in one calm place.
          </p>
        </div>
        <Surface as="form" className="flex flex-col gap-5" onSubmit={onSubmit}>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Create account
          </h1>
          <Field label="Name (optional)">
            <TextInput
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error ? <InlineError>{error}</InlineError> : null}
          <Button type="submit" loading={submitting}>
            {submitting ? "Creating…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-ink-muted">
            Already have an account?{" "}
            <Link
              className="font-medium text-accent-hover underline-offset-2 hover:underline"
              to="/login"
            >
              Log in
            </Link>
          </p>
        </Surface>
      </div>
    </main>
  );
}

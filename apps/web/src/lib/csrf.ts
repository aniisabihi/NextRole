let csrfBootstrap: Promise<void> | null = null;

export function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/** Ensure CSRF cookie exists before mutating requests. Dedupes concurrent fetches. */
export function ensureCsrfCookie(): Promise<void> {
  if (getCsrfToken()) return Promise.resolve();
  if (!csrfBootstrap) {
    csrfBootstrap = fetch("/api/auth/csrf", { credentials: "include" })
      .then(() => undefined)
      .finally(() => {
        csrfBootstrap = null;
      });
  }
  return csrfBootstrap;
}

import { ensureCsrfCookie, getCsrfToken } from "./csrf";

/** 401 here is a credential/session failure — never try refresh or hard-redirect. */
const SKIP_REFRESH_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
]);

let refreshPromise: Promise<boolean> | null = null;

function friendlyHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return "That request wasn’t valid. Check your input and try again.";
    case 401:
      return "Please sign in to continue.";
    case 403:
      return "You don’t have permission to do that.";
    case 404:
      return "We couldn’t find that item.";
    case 409:
      return "That change conflicts with another update. Please try again.";
    case 429:
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

async function rawRefresh(): Promise<boolean> {
  await ensureCsrfCookie();
  const csrf = getCsrfToken();
  if (!csrf) return false;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": csrf },
  });
  return res.ok;
}

async function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = rawRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    const msg = body.error?.message?.trim();
    if (msg) return msg;
  } catch {
    // non-JSON body
  }
  return friendlyHttpStatus(res.status);
}

/** Prefer server/user Error message; never show bare codes or empty strings. */
export function userErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg && !/^HTTP \d{3}$/i.test(msg)) return msg;
  }
  return fallback;
}

export async function apiClient<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    await ensureCsrfCookie();
    const csrf = getCsrfToken();
    if (!csrf) {
      throw new Error(
        "Couldn’t verify your session. Refresh the page and try again.",
      );
    }
    headers.set("X-CSRF-Token", csrf);
  }
  const doFetch = () =>
    fetch(path, { ...init, method, headers, credentials: "include" });

  let res = await doFetch();
  if (res.status === 401 && !SKIP_REFRESH_PATHS.has(path)) {
    const ok = await refreshOnce();
    if (!ok) {
      window.location.href = "/login";
      throw new Error("Please sign in to continue.");
    }
    res = await doFetch();
  }
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

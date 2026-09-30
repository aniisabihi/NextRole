import { getCsrfToken } from "./csrf";

/** 401 here is a credential/session failure — never try refresh or hard-redirect. */
const SKIP_REFRESH_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
]);

let refreshPromise: Promise<boolean> | null = null;

async function rawRefresh(): Promise<boolean> {
  const csrf = getCsrfToken();
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: csrf ? { "X-CSRF-Token": csrf } : {},
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
    if (body.error?.message) return body.error.message;
  } catch {
    // non-JSON body
  }
  return `HTTP ${res.status}`;
}

export async function apiClient<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    const csrf = getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const doFetch = () =>
    fetch(path, { ...init, method, headers, credentials: "include" });

  let res = await doFetch();
  if (res.status === 401 && !SKIP_REFRESH_PATHS.has(path)) {
    const ok = await refreshOnce();
    if (!ok) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    res = await doFetch();
  }
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

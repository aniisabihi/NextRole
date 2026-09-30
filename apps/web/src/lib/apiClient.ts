import { getCsrfToken } from "./csrf";

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
  if (res.status === 401 && path !== "/api/auth/refresh") {
    const ok = await refreshOnce();
    if (!ok) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    res = await doFetch();
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

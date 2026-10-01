import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppNav } from "./AppNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70 bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link
            to="/dashboard"
            className="font-display text-xl font-semibold tracking-tight text-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            NextRole
          </Link>
          <AppNav />
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

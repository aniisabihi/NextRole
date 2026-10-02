import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppNav } from "./AppNav";
import { ReminderBell } from "./reminders/ReminderBell";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only rounded-[var(--radius-control)] bg-surface px-4 py-2 text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b border-border/70 bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link
            to="/dashboard"
            className="font-display text-xl font-semibold tracking-tight text-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            NextRole
          </Link>
          <div className="flex items-center gap-2">
            <AppNav />
            <ReminderBell />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8"
      >
        {children}
      </main>
    </div>
  );
}

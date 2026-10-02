import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import {
  badgeAriaLabel,
  badgeText,
  dueBadgeCount,
} from "../../lib/reminder-badge";
import { formatReminderDue } from "../../lib/reminder-format";
import type { Reminder, ReminderListResponse } from "../../lib/types";
import { InlineError } from "../ui/InlineError";
import { ReminderPrefsModal } from "./ReminderPrefsModal";

const SCHEDULED_PREVIEW = 3;

export function ReminderBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Hoisted above the dropdown: closing the menu must not unmount the modal.
  const [prefsOpen, setPrefsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const dismissRefs = useRef(new Map<string, HTMLButtonElement>());
  const prevDueCount = useRef<number | null>(null);
  const [focusTargetId, setFocusTargetId] = useState<string | null | undefined>(
    undefined,
  );
  const [liveText, setLiveText] = useState("");

  const query = useQuery({
    queryKey: ["reminders"],
    queryFn: () =>
      apiClient<ReminderListResponse>(
        "/api/reminders?status=DUE,SCHEDULED&limit=50",
      ),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const items = query.data?.items ?? [];
  const due = items.filter((r) => r.status === "DUE");
  const scheduled = items
    .filter((r) => r.status === "SCHEDULED")
    .slice(0, SCHEDULED_PREVIEW);
  const dueCount = dueBadgeCount(items);
  const badge = badgeText(dueCount);

  // Live region: announce only when the due count changes after the first load.
  useEffect(() => {
    if (!query.isSuccess) return;
    const prev = prevDueCount.current;
    prevDueCount.current = dueCount;
    if (prev === null || prev === dueCount) return;
    setLiveText(
      dueCount === 0
        ? "No reminders due"
        : `${dueCount} ${dueCount === 1 ? "reminder" : "reminders"} due`,
    );
  }, [dueCount, query.isSuccess]);

  // Move focus after a dismiss re-render: next due row, else the bell toggle.
  useEffect(() => {
    if (focusTargetId === undefined) return;
    const el = focusTargetId ? dismissRefs.current.get(focusTargetId) : null;
    if (focusTargetId && !el) return; // row not rendered yet; effect re-runs on items change
    (el ?? buttonRef.current)?.focus();
    setFocusTargetId(undefined);
  }, [focusTargetId, items]);

  const dismiss = useMutation({
    mutationFn: (id: string) =>
      apiClient<Reminder>(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISMISSED" }),
      }),
    onSuccess: async (_data, id) => {
      const reminder = items.find((r) => r.id === id);
      const dueIdsBefore = due.map((r) => r.id);
      const dismissedIndex = Math.max(dueIdsBefore.indexOf(id), 0);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reminders"] }),
        reminder
          ? queryClient.invalidateQueries({
              queryKey: ["application-activities", reminder.applicationId],
            })
          : Promise.resolve(),
      ]);
      const fresh =
        queryClient.getQueryData<ReminderListResponse>(["reminders"])?.items ??
        [];
      const remainingDue = fresh.filter((r) => r.status === "DUE");
      const next =
        remainingDue[Math.min(dismissedIndex, remainingDue.length - 1)];
      setFocusTargetId(next ? next.id : null);
    },
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function renderRow(r: Reminder) {
    const href = `/applications/${r.applicationId}`;
    return (
      <li
        key={r.id}
        className="flex items-start justify-between gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
      >
        <Link
          to={href}
          onClick={() => setOpen(false)}
          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[var(--radius-control)] px-1 py-1 no-underline hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="truncate text-sm font-medium text-ink">
            {r.title}
          </span>
          {r.application ? (
            <span className="truncate text-xs text-ink-muted">
              {r.application.company} — {r.application.title}
            </span>
          ) : null}
          <span className="text-xs text-ink-faint">
            {r.status === "DUE" ? "Due " : "Scheduled "}
            {formatReminderDue(r.dueAt)}
          </span>
        </Link>
        <button
          type="button"
          ref={(el) => {
            if (el) dismissRefs.current.set(r.id, el);
            else dismissRefs.current.delete(r.id);
          }}
          onClick={() => dismiss.mutate(r.id)}
          disabled={dismiss.isPending}
          aria-label={`Dismiss reminder: ${r.title}`}
          className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-2 text-xs font-medium text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          Dismiss
        </button>
      </li>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={badgeAriaLabel(dueCount)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[0.6875rem] font-semibold leading-none text-white"
          >
            {badge}
          </span>
        ) : null}
      </button>
      <span aria-live="polite" role="status" className="sr-only">
        {liveText}
      </span>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Reminders"
          className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-panel)] border border-border/80 bg-surface shadow-[0_8px_32px_rgba(26,31,46,0.12)]"
        >
          {query.isPending ? (
            <p className="px-4 py-3 text-sm text-ink-muted">Loading…</p>
          ) : query.isError ? (
            <div className="px-3 py-3">
              <InlineError>Could not load reminders.</InlineError>
            </div>
          ) : due.length === 0 && scheduled.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">
              No reminders yet.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {due.length > 0 ? (
                <section aria-label="Due">
                  <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Due
                  </h3>
                  <ul>{due.map(renderRow)}</ul>
                </section>
              ) : null}
              {scheduled.length > 0 ? (
                <section aria-label="Upcoming">
                  <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Upcoming
                  </h3>
                  <ul>{scheduled.map(renderRow)}</ul>
                </section>
              ) : null}
            </div>
          )}
          {dismiss.isError ? (
            <div className="border-t border-border/70 px-3 py-2">
              <InlineError>
                {dismiss.error instanceof Error
                  ? dismiss.error.message
                  : "Could not dismiss reminder."}
              </InlineError>
            </div>
          ) : null}
          <div className="border-t border-border/70 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPrefsOpen(true);
              }}
              className="min-h-11 w-full rounded-[var(--radius-control)] px-3 text-left text-sm font-medium text-accent-hover transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Reminder settings
            </button>
          </div>
        </div>
      ) : null}

      {prefsOpen ? (
        <ReminderPrefsModal
          onClose={() => setPrefsOpen(false)}
          returnFocusRef={buttonRef}
        />
      ) : null}
    </div>
  );
}

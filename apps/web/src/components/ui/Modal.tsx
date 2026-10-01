import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Modal dialog on native `<dialog>` + `showModal()`: browser traps focus,
 * makes the rest of the page inert, and labels via `aria-labelledby`.
 * Mount to open, unmount to close. Esc and backdrop click call `onClose`.
 * On unmount focus returns to the opener, or `returnFocusRef` when the
 * opener is gone (e.g. a dropdown item that unmounted).
 */
export function Modal({
  title,
  onClose,
  children,
  returnFocusRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!dialog.open) dialog.showModal();

    // Native Esc fires `cancel`; route through React state instead.
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);

    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      const openerUsable =
        opener && opener.isConnected && opener !== document.body;
      const target = openerUsable ? opener : returnFocusRef?.current;
      target?.focus();
    };
  }, [returnFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-border/80 bg-surface p-0 text-ink shadow-[0_8px_32px_rgba(26,31,46,0.16)] backdrop:bg-ink/30"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="font-display text-xl font-semibold text-ink"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

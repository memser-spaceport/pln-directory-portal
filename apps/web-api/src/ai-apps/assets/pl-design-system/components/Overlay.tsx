import { useCallback, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Overlay — the shared machinery behind `Modal` and `Drawer`.
 *
 * A modal dialog is mostly not chrome; it is five behaviours that are easy to
 * get wrong and are therefore implemented once here:
 *
 *   1. focus moves into the dialog on open, to the first focusable element that
 *      is not the dismiss control (or the panel itself if there is none),
 *   2. focus is trapped — Tab from the last element wraps to the first,
 *   3. focus returns to whatever opened it on close,
 *   4. Escape closes,
 *   5. the page behind stops scrolling, and is hidden from assistive tech.
 *
 * Not exported from the package index on its own — `Modal` and `Drawer` are the
 * public surface. Documented here because the behaviour is the component.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Panel classes — this is what makes a Modal a Modal and a Drawer a Drawer. */
  panelClassName?: string;
  /** Positioning of the panel within the viewport. */
  containerClassName?: string;
  /** Set to false when the panel must be dismissed deliberately. */
  closeOnScrim?: boolean;
  closeOnEscape?: boolean;
  labelledBy?: string;
  describedBy?: string;
  children: ReactNode;
}

export function Overlay({
  open,
  onClose,
  panelClassName,
  containerClassName,
  closeOnScrim = true,
  closeOnEscape = true,
  labelledBy,
  describedBy,
  children,
}: OverlayProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && closeOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;

      const items = Array.from(
        panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [closeOnEscape, onClose],
  );

  /* Open/close side effects: remember the trigger, move focus in, lock the
     page, and undo all three on close. */
  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    /* Prefer the first focusable that is NOT the dismiss control. Landing on
       the header's X means Enter closes the dialog the user just opened — a
       footgun, and the one thing a keyboard user is most likely to do next. */
    const items = Array.from(
      panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const target =
      items.find((el) => !el.hasAttribute("data-overlay-dismiss")) ??
      items[0] ??
      panel.current;
    target?.focus();

    const { overflow, paddingRight } = document.body.style;
    /* Compensate for the scrollbar so the page behind does not shift sideways
       as it locks — a jump on open reads as a bug. */
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      restoreTo.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn("fixed inset-0 z-[var(--pl-z-modal)] flex", containerClassName)}
      onKeyDown={onKeyDown}
    >
      {/* Decorative: the dialog's own close control is the accessible way out,
          and Escape is the keyboard one. A clickable scrim is a pointer
          convenience, not an affordance to announce. */}
      <div
        aria-hidden="true"
        onClick={closeOnScrim ? onClose : undefined}
        className={cn(
          "absolute inset-0 bg-scrim",
          closeOnScrim && "cursor-pointer",
        )}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn("relative outline-none", panelClassName)}
      >
        {children}
      </div>
    </div>
  );
}

/* ── shared panel furniture ────────────────────────────────────────────── */

export interface OverlayHeaderProps {
  id?: string;
  title: ReactNode;
  supporting?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
}

export function OverlayHeader({
  id,
  title,
  supporting,
  onClose,
  closeLabel = "Close",
  className,
}: OverlayHeaderProps) {
  return (
    <div className={cn("flex items-start gap-4 px-6 pb-4 pt-6", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={id} className="m-0 text-lg font-semibold tracking-title text-primary">
          {title}
        </h2>
        {supporting && (
          <p className="m-0 text-base leading-normal tracking-body text-tertiary">
            {supporting}
          </p>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          aria-label={closeLabel}
          data-overlay-dismiss=""
          onClick={onClose}
          className={cn(
            "-mr-1 -mt-1 shrink-0 cursor-pointer rounded-md p-1.5 text-secondary",
            "transition-colors hover:bg-hover hover:text-primary",
            "outline-none focus-visible:ring-2 focus-visible:ring-action-ring",
          )}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m5 5 10 10m0-10-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function OverlayBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-6 py-2",
        "text-base leading-normal tracking-body text-secondary",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function OverlayFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-table-border px-6 py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Stable ids for the title/description wiring, so callers do not hand-roll them. */
export function useOverlayIds() {
  const base = useId();
  return { titleId: `${base}-title`, descId: `${base}-desc` };
}

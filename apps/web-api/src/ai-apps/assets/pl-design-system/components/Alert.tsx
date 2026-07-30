import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Alert — an inline message about the page or a section of it.
 * Toast — the same message, floating, about something that just happened.
 *
 * From the Figma `Alerts & Notification` page and the published `Notification`
 * component set. Tones map onto the system's existing status ramp rather than a
 * new one.
 *
 * The distinction that matters: an Alert is part of the layout and stays until
 * the condition changes; a Toast is transient and must never be the only place
 * an important message appears. Anything a user might need to act on later
 * belongs in an Alert.
 */

export type AlertTone = "info" | "success" | "warning" | "danger" | "neutral";

const TONE: Record<AlertTone, { frame: string; icon: string; glyph: ReactNode }> = {
  info: {
    frame: "border-border-brand-subtle bg-selected",
    icon: "text-brand",
    glyph: (
      <>
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="6.25" r="1" fill="currentColor" />
      </>
    ),
  },
  success: {
    frame: "border-transparent bg-action-success-light",
    icon: "text-trend-up",
    glyph: (
      <>
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="m6.5 10.25 2.25 2.25 4.75-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  warning: {
    frame: "border-transparent bg-action-warning-light",
    icon: "text-action-warning-fg",
    glyph: (
      <>
        <path d="M10 2.75 18 16.5H2L10 2.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 7.75v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="13.75" r="0.9" fill="currentColor" />
      </>
    ),
  },
  danger: {
    frame: "border-transparent bg-action-error-light",
    icon: "text-trend-down",
    glyph: (
      <>
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="m7.25 7.25 5.5 5.5m0-5.5-5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },
  neutral: {
    frame: "border-border-subtle bg-surface-subtle",
    icon: "text-secondary",
    glyph: (
      <>
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="6.25" r="1" fill="currentColor" />
      </>
    ),
  },
};

function ToneIcon({ tone }: { tone: AlertTone }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn("mt-px shrink-0", TONE[tone].icon)}
    >
      {TONE[tone].glyph}
    </svg>
  );
}

function DismissButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "-m-1 shrink-0 cursor-pointer rounded-md p-1 text-secondary",
        "transition-colors hover:bg-hover hover:text-primary",
        "outline-none focus-visible:ring-2 focus-visible:ring-action-ring",
      )}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export interface AlertProps {
  tone?: AlertTone;
  /** Bold first line. Omit for a one-line alert. */
  title?: ReactNode;
  children: ReactNode;
  /** Buttons. Use `size="sm"`; an alert is not the main event on the page. */
  actions?: ReactNode;
  /** Show a close button. Only for alerts the user can genuinely dismiss. */
  onDismiss?: () => void;
  /** Accessible name for the close button — say what is being dismissed. */
  dismissLabel?: string;
  /**
   * Announce to assistive tech when this appears. `polite` for confirmations,
   * `assertive` for errors that block the user. Omit for alerts present on load.
   */
  live?: "polite" | "assertive";
  className?: string;
}

export function Alert({
  tone = "info",
  title,
  children,
  actions,
  onDismiss,
  dismissLabel = "Dismiss",
  live,
  className,
}: AlertProps) {
  return (
    <div
      /* role="alert" implies aria-live="assertive"; "status" implies polite.
         Neither is set when `live` is absent, so a page that renders with three
         alerts already on it does not read all three out. */
      role={live === "assertive" ? "alert" : live === "polite" ? "status" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        "text-base leading-normal tracking-body text-secondary",
        TONE[tone].frame,
        className,
      )}
    >
      <ToneIcon tone={tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="m-0 font-semibold text-primary">{title}</p>}
        <div className="min-w-0">{children}</div>
        {actions && <div className="mt-1 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {onDismiss && <DismissButton onClick={onDismiss} label={dismissLabel} />}
    </div>
  );
}

/* ── toast ─────────────────────────────────────────────────────────────── */

export interface ToastProps extends Omit<AlertProps, "live"> {}

/**
 * Toast — a floating, transient notification. White surface with the tone
 * carried by the icon and a leading rule, so a stack of toasts over arbitrary
 * page content stays readable.
 */
export function Toast({
  tone = "info",
  title,
  children,
  actions,
  onDismiss,
  dismissLabel = "Dismiss notification",
  className,
}: ToastProps) {
  const RULE: Record<AlertTone, string> = {
    info: "before:bg-action",
    success: "before:bg-action-success",
    warning: "before:bg-action-warning",
    danger: "before:bg-action-error",
    neutral: "before:bg-border-strong",
  };

  return (
    <div
      className={cn(
        "relative flex w-88 max-w-full items-start gap-3 overflow-hidden",
        "rounded-xl border border-border-subtle bg-surface px-4 py-3 shadow-overlay",
        "text-base leading-normal tracking-body text-secondary",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        RULE[tone],
        className,
      )}
    >
      <ToneIcon tone={tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="m-0 font-semibold text-primary">{title}</p>}
        <div className="min-w-0">{children}</div>
        {actions && <div className="mt-1 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {onDismiss && <DismissButton onClick={onDismiss} label={dismissLabel} />}
    </div>
  );
}

export interface ToastRegionProps {
  /** Corner to anchor the stack to. */
  placement?: "top-right" | "top-center" | "bottom-right" | "bottom-center";
  children: ReactNode;
  className?: string;
}

/**
 * ToastRegion — the fixed container and, more importantly, the live region.
 * Mount exactly one per app. Without it, toasts are silent to screen readers.
 */
export function ToastRegion({
  placement = "top-right",
  children,
  className,
}: ToastRegionProps) {
  const POS = {
    "top-right": "top-4 right-4 items-end",
    "top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
    "bottom-right": "bottom-4 right-4 items-end",
    "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
  } as const;

  return (
    <div
      role="region"
      aria-label="Notifications"
      /* polite, so a toast waits for the user's screen reader to finish rather
         than cutting across what they are reading. Errors that must interrupt
         belong in an assertive Alert next to the thing that failed. */
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed z-[var(--pl-z-toast)] flex flex-col gap-3",
        "[&>*]:pointer-events-auto",
        POS[placement],
        className,
      )}
    >
      {children}
    </div>
  );
}

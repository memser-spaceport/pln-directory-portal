import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Badge — small count/status marker. The "N updates" chip on demo-day team
 * cards is `tone="info"`.
 *
 * Distinct from Tag: Badge states a fact about an entity (count, status);
 * Tag is a category label that is often filterable.
 */
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

/* Tints are flat surfaces rather than alpha modifiers: the theme maps colours
   through var() indirection, where `bg-success/10` does not reliably resolve. */
const tones: Record<Tone, string> = {
  neutral: "border-border bg-surface-sunken text-secondary",
  info: "border-border-brand bg-selected text-brand",
  success: "border-transparent bg-surface-subtle text-success",
  warning: "border-transparent bg-surface-subtle text-warning",
  danger: "border-transparent bg-surface-subtle text-danger",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-9 items-center justify-center gap-0.5",
        "rounded-pill border px-2 py-0.5",
        "text-2xs font-medium tracking-body whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * StatusDot — the 6px coloured dot preceding a status label in card meta rows.
 * Decorative: the adjacent text carries the meaning.
 */
export function StatusDot({
  tone = "neutral",
  className,
}: {
  tone?: Tone;
  className?: string;
}) {
  const fills: Record<Tone, string> = {
    neutral: "bg-neutral",
    info: "bg-info",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return (
    <span
      aria-hidden="true"
      className={cn("block h-1.5 w-1.5 shrink-0 rounded-full", fills[tone], className)}
    />
  );
}

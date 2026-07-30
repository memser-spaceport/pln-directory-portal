import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Toggle — on/off switch.
 *
 * From Figma `Toggle` (node 14643:30883), 24 variants: pressed on/off,
 * types dot / with-icon, states normal/hover/focus/disabled. Track is
 * sunken neutral when off and brand blue when on; the thumb is a white
 * circle carrying the card shadow. `label` renders a clickable side label.
 */
export interface ToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type"> {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  size?: "md" | "sm";
  /** Tiny ×/✓ glyphs inside the thumb — the Figma "With Icon" type. */
  icons?: boolean;
  label?: ReactNode;
  disabled?: boolean;
}

export function Toggle({
  checked,
  onChange,
  size = "md",
  icons,
  label,
  disabled,
  className,
  ...rest
}: ToggleProps) {
  const track =
    size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const thumb =
    size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const travel = size === "sm" ? "translate-x-3" : "translate-x-4";

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-pill",
        "border-none p-0.5 transition-colors",
        track,
        checked ? "bg-action hover:bg-action-hover" : "bg-surface-sunken hover:bg-neutral",
        disabled && "cursor-not-allowed",
        disabled && (checked ? "bg-selected hover:bg-selected" : "bg-surface-subtle hover:bg-surface-subtle"),
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full bg-surface shadow-card",
          "transition-transform",
          thumb,
          checked && travel,
          checked ? "text-brand" : "text-tertiary",
          disabled && "text-disabled",
        )}
      >
        {icons &&
          (checked ? (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 4.2 3.2 6l3.3-3.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M2 2l4 4M6 2 2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          ))}
      </span>
    </button>
  );

  if (!label) return control;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2",
        disabled && "cursor-not-allowed",
      )}
    >
      {control}
      <span
        className={cn(
          "text-base text-primary tracking-body",
          disabled && "text-disabled",
        )}
      >
        {label}
      </span>
    </label>
  );
}

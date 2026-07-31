import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Checkbox — selection control covering both checkbox and radio semantics.
 *
 * From Figma `Checkbox` (node 17215:16334), 48 variants: Type checkbox |
 * radio, states unchecked/checked/indeterminate/hover/focus/disabled,
 * sizes medium (16px) | large (20px). Checked fill is the brand action
 * blue; the square shape uses a 4px radius, radio is a circle.
 */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Renders a radio input + circular shape. */
  type?: "checkbox" | "radio";
  size?: "md" | "lg";
  /** Indeterminate ("minus") presentation — checkbox only. */
  indeterminate?: boolean;
}

export function Checkbox({
  type = "checkbox",
  size = "md",
  indeterminate,
  className,
  checked,
  disabled,
  ...rest
}: CheckboxProps) {
  const box = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const isOn = checked || indeterminate;

  return (
    <span className={cn("relative inline-flex shrink-0", box)}>
      <input
        type={type}
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el && type === "checkbox") el.indeterminate = !!indeterminate;
        }}
        className={cn(
          "peer absolute inset-0 m-0 cursor-pointer appearance-none border transition-colors",
          type === "radio" ? "rounded-full" : "rounded-sm",
          isOn
            ? "border-transparent bg-action hover:bg-action-hover"
            : "border-border bg-surface hover:border-border-strong",
          disabled &&
            "cursor-not-allowed border-border-subtle bg-surface-sunken hover:bg-surface-sunken",
          disabled && isOn && "border-transparent bg-selected",
          className,
        )}
        {...rest}
      />
      {/* check / minus / dot indicator */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center",
          isOn ? "text-action-fg" : "text-transparent",
          disabled && isOn && "text-brand",
        )}
      >
        {type === "radio" ? (
          <span
            className={cn(
              "rounded-full bg-current",
              size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5",
            )}
          />
        ) : indeterminate ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M1.8 5.2 4 7.4l4.2-4.6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </span>
  );
}

/**
 * CheckboxLabel — a checkbox/radio with its clickable label and optional
 * sub-label, the Figma `Checkbox Label` composition.
 */
export interface CheckboxLabelProps extends CheckboxProps {
  label: ReactNode;
  subLabel?: ReactNode;
}

export function CheckboxLabel({
  label,
  subLabel,
  disabled,
  className,
  ...rest
}: CheckboxLabelProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2",
        disabled && "cursor-not-allowed",
        className,
      )}
    >
      <span className="flex h-5 items-center">
        <Checkbox disabled={disabled} {...rest} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "text-base text-primary tracking-body",
            disabled && "text-disabled",
          )}
        >
          {label}
        </span>
        {subLabel && (
          <span className="text-xs leading-snug text-tertiary tracking-body">
            {subLabel}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * CheckboxGroup — fieldset wrapper for related options, from Figma
 * `Checkbox Group` (node 14352:23080).
 */
export interface CheckboxGroupProps {
  /** Group heading, rendered as the fieldset legend. */
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CheckboxGroup({ label, children, className }: CheckboxGroupProps) {
  return (
    <fieldset className={cn("m-0 min-w-0 border-none p-0", className)}>
      {label && (
        <legend className="mb-2 p-0 text-base font-medium text-primary tracking-body">
          {label}
        </legend>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </fieldset>
  );
}

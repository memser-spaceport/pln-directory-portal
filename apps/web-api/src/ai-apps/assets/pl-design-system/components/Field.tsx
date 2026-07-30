import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Field — the shared frame around every form control: label, optional
 * marker, helper text and error text.
 *
 * From Figma `Redymade input` (node 15774:31295): label is 14px medium,
 * an "(Optional)" suffix in tertiary, helper text is 12px tertiary with
 * an optional info icon, error replaces helper in the danger colour.
 */
export interface FieldProps {
  label?: string;
  /**
   * `stacked` puts the label above the control (the form default). `inline` puts it
   * beside, which is the "Sort by: […]" pattern on the Figma Members page — a
   * *setting*, not a form field, where a label above would imply a form.
   */
  orientation?: "stacked" | "inline";
  /** Renders "(Optional)" after the label. */
  optional?: boolean;
  /** Renders a required asterisk after the label. */
  required?: boolean;
  /** 12px line under the control. Replaced by `error` when set. */
  helper?: ReactNode;
  /** Error message — also flips the control into its error state via context class. */
  error?: ReactNode;
  /** id of the control, so the label points at it. */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  orientation = "stacked",
  optional,
  required,
  helper,
  error,
  htmlFor,
  children,
  className,
}: FieldProps) {
  return (
    <div
      className={cn(
        "flex min-w-0",
        orientation === "inline"
          ? "flex-row items-center gap-2"
          : "flex-col gap-1",
        className,
      )}
    >
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-base font-medium text-primary tracking-body"
        >
          {label}
          {optional && (
            <span className="ml-1 font-regular text-tertiary">(Optional)</span>
          )}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="m-0 text-xs leading-snug text-danger tracking-body" role="alert">
          {error}
        </p>
      ) : (
        helper && (
          <p className="m-0 text-xs leading-snug text-tertiary tracking-body">
            {helper}
          </p>
        )
      )}
    </div>
  );
}

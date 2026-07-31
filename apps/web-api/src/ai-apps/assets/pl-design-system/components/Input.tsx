import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Input — single-line text field.
 *
 * From Figma `Redymade input` (node 15774:31295): 40px tall, 8px radius
 * (rounded-lg), 12px horizontal padding, placeholder in tertiary, subtle
 * xs shadow on the resting field. Wrap in <Field> for label/helper/error.
 */
export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** 16px leading icon or short prefix ("$", country flag). */
  iconStart?: ReactNode;
  /** 16px trailing icon or suffix. */
  iconEnd?: ReactNode;
  /** Renders the danger border + focus treatment. */
  invalid?: boolean;
  containerClassName?: string;
}

export function Input({
  iconStart,
  iconEnd,
  invalid,
  containerClassName,
  className,
  disabled,
  ...rest
}: InputProps) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center",
        containerClassName,
      )}
    >
      {iconStart && (
        <span className="pointer-events-none absolute left-3 flex items-center text-tertiary">
          {iconStart}
        </span>
      )}
      <input
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={cn(
          "h-10 w-full rounded-lg border bg-surface shadow-card",
          "px-3 text-base text-primary placeholder:text-tertiary",
          "tracking-body transition-colors",
          !!iconStart && "pl-9",
          !!iconEnd && "pr-9",
          invalid
            ? "border-danger"
            : "border-border hover:border-border-strong",
          disabled &&
            "cursor-not-allowed bg-surface-subtle text-disabled shadow-none hover:border-border",
          className,
        )}
        {...rest}
      />
      {iconEnd && (
        <span className="pointer-events-none absolute right-3 flex items-center text-tertiary">
          {iconEnd}
        </span>
      )}
    </div>
  );
}

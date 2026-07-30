import type { ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * TextArea — multi-line text field.
 *
 * From Figma `TextArea Input Field` (node 13842:8583), 12 variants:
 * styles Border | Fill, states default/typing/focus/filled/error/disabled.
 * Fill style drops the border and sits on the subtle surface. An optional
 * toolbar slot renders the editor-options row the design shows along the
 * bottom edge (bold/italic/link/…) — pass your own controls.
 */
export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Border (default) or Fill — the borderless variant on subtle surface. */
  variant?: "border" | "fill";
  invalid?: boolean;
  /** Editor controls rendered inside the field, along the bottom. */
  toolbar?: ReactNode;
  containerClassName?: string;
}

export function TextArea({
  variant = "border",
  invalid,
  toolbar,
  containerClassName,
  className,
  disabled,
  rows = 4,
  ...rest
}: TextAreaProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border transition-colors",
        variant === "border"
          ? "bg-surface shadow-card"
          : "border-transparent bg-surface-subtle",
        invalid
          ? "border-danger"
          : variant === "border" && "border-border hover:border-border-strong",
        disabled &&
          "cursor-not-allowed border-border bg-surface-subtle shadow-none",
        containerClassName,
      )}
    >
      <textarea
        aria-invalid={invalid || undefined}
        disabled={disabled}
        rows={rows}
        className={cn(
          "w-full resize-y border-none bg-transparent px-3 py-2.5 outline-none",
          "text-base leading-relaxed text-primary placeholder:text-tertiary",
          "tracking-body",
          disabled && "cursor-not-allowed text-disabled",
          className,
        )}
        {...rest}
      />
      {toolbar && (
        <div className="flex items-center gap-1 px-2 py-1.5 text-tertiary">
          {toolbar}
        </div>
      )}
    </div>
  );
}

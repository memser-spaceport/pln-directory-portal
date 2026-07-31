import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * SearchInput — the global search field in the navbar and the local filter
 * field above list views.
 *
 * Fixes two captured defects: the field was hardcoded to `font-family: Arial`
 * (every other surface is Inter), and the clear button had no accessible name.
 */
export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  onClear?: () => void;
  containerClassName?: string;
}

export function SearchInput({
  onClear,
  value,
  placeholder = "Search",
  containerClassName,
  className,
  ...rest
}: SearchInputProps) {
  const hasValue = typeof value === "string" && value.length > 0;

  return (
    <div className={cn("relative flex min-w-0 flex-1", containerClassName)}>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        className={cn(
          "h-10 w-full rounded-lg border border-border bg-surface",
          "py-2.5 pl-3 pr-10 text-base text-primary placeholder:text-tertiary",
          "tracking-body transition-colors hover:border-border-strong",
          className,
        )}
        {...rest}
      />
      {hasValue && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className={cn(
            "absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2",
            "cursor-pointer items-center justify-center rounded-md",
            "text-tertiary hover:bg-hover hover:text-primary",
          )}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
            <path
              d="M12 4 4 12M4 4l8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

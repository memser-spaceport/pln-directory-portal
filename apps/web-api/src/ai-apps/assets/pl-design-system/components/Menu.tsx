import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";

/**
 * Menu / Select — the dropdown pattern.
 *
 * From Figma `Context Menu` (node 20382:23923) and `dropdown button`
 * (node 22981:38382): the panel is a white surface, 8px radius, subtle
 * border, floating on the overlay shadow; items are 14px medium in
 * secondary, destructive items in danger, separated by subtle rules.
 * The trigger is either a secondary button with a chevron or the pill
 * variant the date pickers use.
 */

/* ---------------------------------------------------------------- panel */

export function MenuPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="menu"
      className={cn(
        "min-w-44 rounded-lg border border-border-subtle bg-surface py-1 shadow-overlay",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface MenuItemProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Renders in the danger colour — delete/remove actions. */
  destructive?: boolean;
  icon?: ReactNode;
  /** Trailing hint — a chevron for nested menus or a shortcut label. */
  trailing?: ReactNode;
}

export function MenuItem({
  destructive,
  icon,
  trailing,
  className,
  children,
  ...rest
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 border-none bg-transparent",
        "px-4 py-2 text-left text-base tracking-body transition-colors hover:bg-hover",
        destructive ? "text-danger" : "text-secondary hover:text-primary",
        className,
      )}
      {...rest}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && (
        <span className="flex shrink-0 items-center text-tertiary">{trailing}</span>
      )}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-border-subtle" />;
}

/* ---------------------------------------------------------------- select */

export interface SelectOption {
  value: string;
  label: ReactNode;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Button-shaped (default) or the pill trigger the date pickers use. */
  trigger?: "button" | "pill";
  disabled?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select…",
  trigger = "button",
  disabled,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex min-w-0", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex cursor-pointer items-center justify-between gap-1.5",
          "border bg-surface text-base tracking-body transition-colors",
          trigger === "pill"
            ? "rounded-pill border-border px-3 h-8 font-medium text-secondary hover:bg-hover"
            : "h-10 rounded-md border-border px-3 text-secondary hover:bg-hover hover:text-primary",
          disabled && "cursor-not-allowed bg-surface-sunken text-disabled hover:bg-surface-sunken",
        )}
      >
        <span className={cn("truncate", !selected && "text-tertiary")}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        >
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[var(--pl-z-dropdown)] mt-1 w-full min-w-44">
          <div
            role="listbox"
            className="rounded-lg border border-border-subtle bg-surface py-1 shadow-overlay"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange?.(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center border-none bg-transparent",
                  "px-3 py-2 text-left text-base tracking-body transition-colors hover:bg-hover",
                  o.value === value
                    ? "bg-selected text-brand"
                    : "text-secondary hover:text-primary",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

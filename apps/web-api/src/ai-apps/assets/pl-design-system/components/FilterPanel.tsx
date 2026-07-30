import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { LinkButton } from "./Link";
import { cn } from "../lib/cn";

/**
 * FilterPanel / FilterSection / CheckboxListItem — the left rail on a directory.
 *
 * From `Filters Sidebar Members Desktop` on the Figma `Directory: Members` page
 * (node 27045:78557), 296 × 1206.
 *
 * `PageShell` has always accepted the rail as an opaque `sidebar` node, so every
 * screen rebuilt it. The rail is highly regular, which is what makes it a component
 * rather than a one-off: three sections drawing from one set of optional slots.
 *
 * | slot | Office Hours | Roles | Investors |
 * |---|---|---|---|
 * | description | ✓ | — | — |
 * | toggle | ✓ | — | ✓ |
 * | search | ✓ | ✓ | ✓ |
 * | checkbox list | — | ✓ | ✓ |
 * | numeric range | — | — | ✓ |
 */

export interface FilterPanelProps {
  /** Sections. */
  children: ReactNode;
  /**
   * Shown as a "Clear all" link when any filter is applied. Omit to hide it —
   * a permanently visible Clear all on an unfiltered list is a dead control.
   */
  onClearAll?: () => void;
  /** Number applied, folded into the Clear all name: "Clear all 3 filters". */
  appliedCount?: number;
  title?: ReactNode;
  className?: string;
}

export function FilterPanel({
  children,
  onClearAll,
  appliedCount,
  title = "Filters",
  className,
}: FilterPanelProps) {
  return (
    /* A complementary landmark, so a screen-reader user can jump to the filters
       and — more importantly — jump back out of them to the results. */
    <aside
      aria-label={typeof title === "string" ? title : "Filters"}
      className={cn("flex w-full min-w-0 flex-col gap-4", className)}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="m-0 text-md font-semibold tracking-title text-primary">{title}</h2>
        {onClearAll && (
          <LinkButton onClick={onClearAll}>
            Clear all
            {typeof appliedCount === "number" && (
              <span className="sr-only"> {appliedCount} filters</span>
            )}
          </LinkButton>
        )}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </aside>
  );
}

/* ── section ───────────────────────────────────────────────────────────── */

export interface FilterSectionProps {
  title: ReactNode;
  /** 20px glyph after the title — Figma puts one on Office Hours. */
  icon?: ReactNode;
  /** Explanatory paragraph under the title. */
  description?: ReactNode;
  /**
   * A row above the body — usually a `Toggle` with its own label
   * ("Show all members with office hours").
   */
  toggle?: ReactNode;
  /** A `SearchInput` to filter this section's own options. */
  search?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * FilterSection — one bordered card in the rail. Every slot is optional; the frame
 * is constant. Renders a `<section>` with an `<h3>`, so the rail has a real
 * outline rather than nine visually-bold paragraphs.
 */
export function FilterSection({
  title,
  icon,
  description,
  toggle,
  search,
  children,
  className,
}: FilterSectionProps) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border border-border-subtle bg-surface",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <h3 className="m-0 min-w-0 flex-1 text-base font-medium tracking-body text-primary">
          {title}
        </h3>
        {icon}
      </div>

      {(description || toggle || search || children) && (
        <div className="flex flex-col gap-3 border-t border-table-border px-4 py-3">
          {description && (
            <p className="m-0 text-base leading-normal tracking-body text-tertiary">
              {description}
            </p>
          )}
          {toggle}
          {search}
          {children}
        </div>
      )}
    </section>
  );
}

/* ── list rows ─────────────────────────────────────────────────────────── */

export interface CheckboxListItemProps {
  /** The option label. */
  children: ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Matching-record count, right-aligned. */
  count?: number;
  disabled?: boolean;
  name?: string;
  className?: string;
}

/**
 * CheckboxListItem — a 32px option row: checkbox, label, count.
 *
 * Figma names this `_BaseDropdownListItem`, which is the tell that it is also the
 * row inside a multi-select `MenuPanel` — the same row in two containers. Built here
 * once so those two never drift.
 *
 * The whole row is the label, so the 32px band is the hit target rather than the
 * 16px box. The count is inside the label element, which means it is announced with
 * the option: "Founder, 134" rather than a number floating nearby.
 */
export function CheckboxListItem({
  children,
  checked,
  onChange,
  count,
  disabled,
  name,
  className,
}: CheckboxListItemProps) {
  return (
    <label
      className={cn(
        "group flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 -mx-1",
        "transition-colors hover:bg-hover",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        className,
      )}
    >
      <span className="relative inline-flex size-4 shrink-0">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.currentTarget.checked)}
          className="peer size-4 cursor-pointer appearance-none rounded-sm border border-action-neutral-light bg-action-neutral-light outline-none checked:border-action checked:bg-action focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
        />
        <Icon
          name="check"
          size={12}
          className="pointer-events-none absolute left-0.5 top-0.5 text-action-fg opacity-0 peer-checked:opacity-100"
        />
      </span>

      <span className="min-w-0 flex-1 truncate text-base tracking-body text-secondary">
        {children}
      </span>

      {typeof count === "number" && (
        <span className="shrink-0 text-xs tabular-nums tracking-body text-tertiary">
          {count.toLocaleString()}
        </span>
      )}
    </label>
  );
}

export interface CheckboxListProps {
  children: ReactNode;
  /** Accessible name for the group, e.g. "Roles". */
  label: string;
  /** Cap the visible height and scroll — for long option lists. */
  maxHeight?: number;
  className?: string;
}

/**
 * CheckboxList — the group wrapper. A real `role="group"` with a name, so the
 * options are announced as belonging to "Roles" rather than as loose checkboxes.
 */
export function CheckboxList({
  children,
  label,
  maxHeight,
  className,
}: CheckboxListProps) {
  return (
    <div
      role="group"
      aria-label={label}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      className={cn("flex flex-col", className)}
    >
      {children}
    </div>
  );
}

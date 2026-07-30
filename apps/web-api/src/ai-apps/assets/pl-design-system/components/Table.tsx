import { createContext, useContext } from "react";
import type {
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
  HTMLAttributes,
} from "react";
import { cn } from "../lib/cn";

/**
 * Table — tabular data.
 *
 * Mirrors two Figma component sets on the Table page:
 *
 *   `Table Cell`   node 14938:8436 — 19 Type variants x Background x State
 *   `Table header` node 14938:29415 — Default / Disabled / Empty
 *
 * The 19 cell "types" are not 19 components. Every one of them is the same
 * frame — 16px horizontal padding, 12px vertical, a 12px gap, a 1px bottom rule
 * — wrapping different content. So `TableCell` is that frame, and the types are
 * compositions: `Badge` for the status cell, `Toggle` for the toggle cell,
 * `ProgressBar`, `Rating`, `Sparkline`, `Trend`, `Flag`, `AvatarStack` for
 * theirs. Table.stories.tsx builds all 19 from these parts.
 *
 * Semantics are real: `<table>`, `<thead>`, `<th scope>`, `<td>`. Row hover and
 * press are CSS states on `<tr>`, not props.
 */

/* ── frame ─────────────────────────────────────────────────────────────── */

/* `zebra` is set once on <Table> but applied by <TableBody>, which is the only
   element that can address "every other row" in one static class. */
const ZebraContext = createContext(false);

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /**
   * Alternating row tint — Figma's `Background=Light gray`. Off by default:
   * every assembled table in the Figma file (node 17260:61462) uses white rows
   * with the hairline rule doing the separating.
   */
  zebra?: boolean;
  /** Accessible name. Required — a table with no caption is a wall of numbers. */
  label: string;
  /**
   * Wrap in a horizontally scrollable, keyboard-reachable region. Leave on
   * unless the table is guaranteed narrower than its column.
   */
  scroll?: boolean;
  children: ReactNode;
  className?: string;
}

export function Table({
  zebra = false,
  label,
  scroll = true,
  children,
  className,
  ...rest
}: TableProps) {
  const table = (
    <ZebraContext.Provider value={zebra}>
      <table
        aria-label={label}
        className={cn(
          "w-full border-collapse text-left text-base tracking-body",
          className,
        )}
        {...rest}
      >
        {children}
      </table>
    </ZebraContext.Provider>
  );

  if (!scroll) return table;

  return (
    /* tabIndex makes the overflow region scrollable by keyboard, which a bare
       overflow-x div is not. */
    <div role="region" aria-label={label} tabIndex={0} className="w-full overflow-x-auto">
      {table}
    </div>
  );
}

export function TableHead({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("bg-table-head", className)} {...rest}>
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  const zebra = useContext(ZebraContext);
  return (
    <tbody
      className={cn(
        zebra && "[&>tr:nth-child(even)]:bg-table-zebra",
        className,
      )}
      {...rest}
    >
      {children}
    </tbody>
  );
}

/* ── header cell ───────────────────────────────────────────────────────── */

export type SortDirection = "asc" | "desc" | "none";

export interface TableHeadCellProps
  extends Omit<ThHTMLAttributes<HTMLTableCellElement>, "onClick" | "align"> {
  children?: ReactNode;
  /** Figma's `Left icon`. 16px; the set uses `Icon / Cube`. */
  icon?: ReactNode;
  /** Leading selection checkbox — pass the `Checkbox` element. */
  checkbox?: ReactNode;
  /**
   * Make the column sortable. Renders Figma's `Icon / CaretUpDown`, collapsing
   * to a single caret once a direction is set.
   */
  sortable?: boolean;
  sort?: SortDirection;
  onSort?: () => void;
  align?: "start" | "center" | "end";
  /** Figma's `Type=Disabled`. */
  disabled?: boolean;
  /**
   * Figma's `Type=Empty` — a header with no label, for the checkbox and
   * actions columns. Still renders an accessible name via `srLabel`.
   */
  empty?: boolean;
  /** Visually hidden column name. Use with `empty`. */
  srLabel?: string;
}

const ALIGN = {
  start: "justify-start text-left",
  center: "justify-center text-center",
  end: "justify-end text-right",
} as const;

function CaretUpDown({ sort }: { sort: SortDirection }) {
  /* Figma `Icon / CaretUpDown`, 20px box, glyph inset 9.37% vertically and
     28.12% horizontally. Once sorted, the inactive half is dropped rather than
     dimmed — two carets at different opacities read as a rendering bug. */
  const up = (
    <path d="M10 4.5l3.75 4.25h-7.5L10 4.5z" fill="currentColor" />
  );
  const down = (
    <path d="M10 15.5l-3.75-4.25h7.5L10 15.5z" fill="currentColor" />
  );
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {sort !== "desc" && up}
      {sort !== "asc" && down}
    </svg>
  );
}

const ARIA_SORT = {
  asc: "ascending",
  desc: "descending",
  none: "none",
} as const;

export function TableHeadCell({
  children,
  icon,
  checkbox,
  sortable,
  sort = "none",
  onSort,
  align = "start",
  disabled,
  empty,
  srLabel,
  className,
  ...rest
}: TableHeadCellProps) {
  const inner = (
    <span className={cn("flex items-center gap-2", ALIGN[align])}>
      {checkbox}
      {!empty && (
        <span className="flex items-center gap-1">
          {icon}
          <span className="whitespace-nowrap">{children}</span>
        </span>
      )}
      {sortable && !empty && <CaretUpDown sort={sort} />}
    </span>
  );

  return (
    <th
      scope="col"
      aria-sort={sortable ? ARIA_SORT[sort] : undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        "border-b border-table-border px-4 py-1 align-middle",
        "text-base font-medium tracking-body whitespace-nowrap",
        disabled ? "text-disabled-subtle" : "text-secondary",
        className,
      )}
      {...rest}
    >
      {srLabel && <span className="sr-only">{srLabel}</span>}
      {sortable && !disabled && !empty ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "-mx-1 flex w-full cursor-pointer items-center rounded-md px-1",
            "transition-colors hover:text-primary",
            ALIGN[align],
          )}
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </th>
  );
}

/* ── row ───────────────────────────────────────────────────────────────── */

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /**
   * The row is a target — clicking it opens the record. Adds the hover and
   * press states from Figma's `State` axis and a keyboard affordance.
   */
  interactive?: boolean;
  selected?: boolean;
  children: ReactNode;
}

export function TableRow({
  interactive,
  selected,
  children,
  className,
  ...rest
}: TableRowProps) {
  return (
    <tr
      data-selected={selected || undefined}
      aria-selected={selected}
      className={cn(
        "transition-colors",
        /* Figma's State axis replaces the row background rather than layering
           on it — which is why hover on a zebra row lightens (4% ink -> 2%)
           while hover on a white row darkens. Reproduced as authored. */
        interactive &&
          "cursor-pointer hover:bg-table-row-hover active:bg-table-row-active",
        /* Selection outranks both the zebra base and hover. */
        selected && "bg-table-row-selected hover:bg-table-row-selected",
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

/* ── body cell ─────────────────────────────────────────────────────────── */

export interface TableCellProps
  extends Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> {
  children?: ReactNode;
  align?: "start" | "center" | "end";
  /**
   * Promote this cell to the row's header — the name column. One per row, and
   * it renders as `<th scope="row">` so a screen reader announces it alongside
   * every other cell in the row.
   */
  rowHeader?: boolean;
  /** Trailing 16px info affordance, present on almost every Figma cell. */
  info?: ReactNode;
  /** Collapse to the content width. For checkbox and actions columns. */
  tight?: boolean;
  className?: string;
}

export function TableCell({
  children,
  align = "start",
  rowHeader,
  info,
  tight,
  className,
  ...rest
}: TableCellProps) {
  const Tag = rowHeader ? "th" : "td";

  return (
    <Tag
      scope={rowHeader ? "row" : undefined}
      className={cn(
        "border-b border-table-border px-4 py-3 align-middle",
        "text-base font-normal tracking-body text-secondary",
        tight && "w-0 whitespace-nowrap",
        align === "center" && "text-center",
        align === "end" && "text-right",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "flex min-w-0 items-center gap-3",
          align === "center" && "justify-center",
          align === "end" && "justify-end",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">{children}</span>
        {info}
      </span>
    </Tag>
  );
}

/* ── cell content helpers ──────────────────────────────────────────────── */

/**
 * TableCellDetails — the two-line "label over supporting text" block shared by
 * Figma's `Basic`, `Icon + details`, `Brand logo + details`, `Avatar + details`
 * and `Toggle + Details` cells. The label is 16px medium, the supporting line
 * 12px regular, 2px apart.
 */
export interface TableCellDetailsProps {
  label: ReactNode;
  supporting?: ReactNode;
  /** Avatar, logo or 16px icon, placed before the text. */
  media?: ReactNode;
  className?: string;
}

export function TableCellDetails({
  label,
  supporting,
  media,
  className,
}: TableCellDetailsProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      {media}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-md font-medium leading-relaxed text-secondary">
          {label}
        </span>
        {supporting != null && (
          <span className="truncate text-xs leading-snug text-tertiary">
            {supporting}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * TableInfoButton — the 16px circular info affordance in the trailing slot of
 * nearly every Figma cell. It is a button, so it needs a name; `label` should
 * say what it explains, not "info".
 */
export interface TableInfoButtonProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
}

export function TableInfoButton({ label, className, ...rest }: TableInfoButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full p-1",
        "text-secondary transition-colors hover:bg-hover hover:text-link",
        className,
      )}
      {...rest}
    >
      {/* Figma `Icon / Info` (14004:11557), 16px, glyph inset 9.38%. */}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M8 7v4"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx="8" cy="5" r="0.85" fill="currentColor" />
      </svg>
    </button>
  );
}

/**
 * TableToolbar — the strip above a table: title, count, and actions. Not a
 * Figma component, but every assembled table in the file (node 17260:61462)
 * has one, so it is here rather than rebuilt per screen.
 */
export interface TableToolbarProps {
  title: ReactNode;
  /** Small count chip beside the title — pass a `Badge`. */
  count?: ReactNode;
  /** Right-aligned actions. */
  actions?: ReactNode;
  className?: string;
}

export function TableToolbar({ title, count, actions, className }: TableToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-md font-semibold tracking-title text-primary">
          {title}
        </h3>
        {count}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

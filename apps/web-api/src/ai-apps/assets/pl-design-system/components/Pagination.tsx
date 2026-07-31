import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Pagination — move through a paged list.
 *
 * From the Figma `Pagination` page and the published `Pagination` component set.
 * Built as the companion to `Table`: a hundred-row table with no pager is
 * unfinished, and the two are almost always used together.
 *
 * It is a `<nav>` containing a list of links-as-buttons. The current page is
 * marked with `aria-current="page"` rather than colour alone, and each control
 * says which page it goes to, so "3" is announced as "Go to page 3".
 */

export interface PaginationProps {
  /** Current page, 1-based. */
  page: number;
  /** Total number of pages. Values below 2 render nothing. */
  pageCount: number;
  onPageChange: (page: number) => void;
  /**
   * How many page numbers to show around the current one. `1` gives
   * `1 … 4 [5] 6 … 20`. Drop to `0` on narrow screens.
   */
  siblings?: number;
  /** Show the first and last page even when truncated. */
  boundaries?: boolean;
  /** Left-hand summary, e.g. "Showing 1–10 of 214". */
  summary?: ReactNode;
  /** Right-hand slot — usually a rows-per-page `Select`. */
  children?: ReactNode;
  /** Accessible name. Distinguishes two pagers on one page. */
  label?: string;
  className?: string;
}

const CELL =
  "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg px-2 " +
  "text-base font-medium tracking-body transition-colors " +
  "outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent";

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={dir === "next" ? "rotate-180" : undefined}
    >
      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Which page numbers to render. Returns numbers and `"gap"` markers.
 * The window is kept a constant width, so the control does not resize as the
 * user pages through — a pager that reflows under the cursor is a trap.
 */
function buildRange(
  page: number,
  pageCount: number,
  siblings: number,
  boundaries: boolean,
): Array<number | "gap"> {
  const edge = boundaries ? 1 : 0;
  /* current + siblings on both sides + both boundaries + both gaps */
  const slots = siblings * 2 + 3 + edge * 2;
  if (pageCount <= slots) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const start = Math.max(edge + 1, Math.min(page - siblings, pageCount - edge - siblings * 2 - 1));
  const end = Math.min(pageCount - edge, Math.max(page + siblings, edge + siblings * 2 + 2));

  const out: Array<number | "gap"> = [];
  if (edge) out.push(1);
  if (start > edge + 1) out.push("gap");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pageCount - edge) out.push("gap");
  if (edge && pageCount > 1) out.push(pageCount);
  return out;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  siblings = 1,
  boundaries = true,
  summary,
  children,
  label = "Pagination",
  className,
}: PaginationProps) {
  /* One page is not a pager. Rendering it anyway trains people to ignore it. */
  if (pageCount < 2) return null;

  const range = buildRange(page, pageCount, siblings, boundaries);
  const go = (p: number) => onPageChange(Math.max(1, Math.min(pageCount, p)));

  return (
    <nav
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
        className,
      )}
    >
      {summary ? (
        <p className="m-0 shrink-0 text-base tracking-body text-tertiary">{summary}</p>
      ) : (
        <span />
      )}

      <ul className="m-0 flex list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="Go to previous page"
            className={cn(CELL, "gap-1 text-secondary hover:bg-hover hover:text-primary")}
          >
            <Chevron dir="prev" />
            <span className="hidden sm:inline">Previous</span>
          </button>
        </li>

        {range.map((item, i) =>
          item === "gap" ? (
            <li key={`gap-${i}`}>
              {/* Not a button: there is nothing to activate. aria-hidden so the
                  ellipsis is not read out as "horizontal ellipsis". */}
              <span
                aria-hidden="true"
                className="inline-flex h-9 min-w-9 items-center justify-center text-base text-tertiary"
              >
                …
              </span>
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                onClick={() => go(item)}
                aria-current={item === page ? "page" : undefined}
                aria-label={item === page ? `Page ${item}, current page` : `Go to page ${item}`}
                className={cn(
                  CELL,
                  "tabular-nums",
                  item === page
                    ? "bg-action text-action-fg shadow-action hover:bg-action-hover"
                    : "text-secondary hover:bg-hover hover:text-primary",
                )}
              >
                {item}
              </button>
            </li>
          ),
        )}

        <li>
          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={page >= pageCount}
            aria-label="Go to next page"
            className={cn(CELL, "gap-1 text-secondary hover:bg-hover hover:text-primary")}
          >
            <span className="hidden sm:inline">Next</span>
            <Chevron dir="next" />
          </button>
        </li>
      </ul>

      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : <span />}
    </nav>
  );
}

import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { cn } from "../lib/cn";

/**
 * Breadcrumbs — where you are, and the way back up.
 *
 * From the `Subheader` on the Figma `Team Page` (`Breadcrumbs`, 900 × 28). Hidden
 * on that frame, but present in the file and needed by every detail page that sits
 * under a directory.
 *
 * An ordered list, because the order is the meaning. The last item is the current
 * page: not a link, and marked `aria-current="page"` — a breadcrumb whose last
 * crumb links to the page you are already on is a dead control.
 */

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  /**
   * Collapse the middle when the trail is longer than this. The first and last
   * crumbs always survive — those are the two people actually use.
   */
  maxItems?: number;
  label?: string;
  className?: string;
}

function Separator() {
  return (
    <Icon
      name="caret-right"
      size={12}
      className="shrink-0 text-quaternary"
    />
  );
}

export function Breadcrumbs({
  items,
  maxItems,
  label = "Breadcrumb",
  className,
}: BreadcrumbsProps) {
  if (!items.length) return null;

  /* Collapse to first … last, keeping the tail intact so the immediate parent
     stays reachable. */
  let shown: Array<Crumb | "gap"> = items;
  if (maxItems && items.length > maxItems) {
    const tail = items.slice(items.length - (maxItems - 1));
    shown = [items[0]!, "gap", ...tail];
  }

  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0">
        {shown.map((item, i) => {
          const isLast = i === shown.length - 1;

          if (item === "gap") {
            return (
              <li key="gap" className="flex items-center gap-2">
                <Separator />
                <span className="text-base text-tertiary" aria-hidden="true">
                  …
                </span>
                <span className="sr-only">
                  {items.length - (maxItems ?? items.length) + 1} more levels
                </span>
              </li>
            );
          }

          return (
            <li key={i} className="flex min-w-0 items-center gap-2">
              {i > 0 && <Separator />}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "min-w-0 truncate text-base tracking-body",
                    isLast ? "font-medium text-primary" : "text-secondary",
                  )}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className={cn(
                    "min-w-0 shrink-0 truncate rounded-sm text-base tracking-body text-secondary",
                    "transition-colors hover:text-link hover:underline hover:underline-offset-2",
                    "outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2",
                  )}
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

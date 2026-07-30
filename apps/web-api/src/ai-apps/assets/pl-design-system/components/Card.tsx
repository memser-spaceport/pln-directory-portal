import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Card — the surface every directory listing sits on.
 *
 * Captured evidence: `border border-border rounded-lg bg-surface py-4 px-4
 * shadow-card`, redeclared on every page with the padding drifting between
 * 15px and 16px. This fixes it at 16px.
 */
export interface CardProps {
  children: ReactNode;
  /** Renders as <a> and adds the hover affordance. */
  href?: string;
  /** Emphasised border — used for featured/selected listings. */
  featured?: boolean;
  className?: string;
}

export function Card({ children, href, featured, className }: CardProps) {
  const classes = cn(
    "block rounded-lg border bg-surface p-4 shadow-card",
    featured ? "border-border-brand" : "border-border-subtle",
    href && "cursor-pointer transition-shadow hover:shadow-raised",
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return <div className={classes}>{children}</div>;
}

/**
 * MetaRow — the dot-separated secondary line under a card title
 * ("· 12 members · Updated 3d ago"). The captures built this by hand with
 * hardcoded 3px separator spans on every card.
 */
export interface MetaRowProps {
  items: ReactNode[];
  className?: string;
}

export function MetaRow({ items, className }: MetaRowProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1.5",
        "text-xs leading-tight text-secondary tracking-body",
        className,
      )}
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <span
              aria-hidden="true"
              className="block h-[3px] w-[3px] shrink-0 rounded-full bg-secondary opacity-50"
            />
          )}
          {item}
        </span>
      ))}
    </div>
  );
}

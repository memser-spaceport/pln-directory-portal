import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * DetailSection — the repeating block on an entity page.
 *
 * From the Figma `Team Page` (node 27043:33267), where **eight of the nine
 * sections are this same frame**: `Investor Details`, `Contact Details`,
 * `Membership Source`, `Communities`, `Contributions`, `Members`, `Focus Area`,
 * `Projects`. Measured off `Team/Investor Details Desktop` (27043:33274).
 *
 * The one thing to get right, because the design is easy to misread: **the label
 * is 14px medium secondary, not a heading.** "Fund Details", "Communities" and the
 * rest are *field-group labels*, styled the same as an input label — only the entity
 * name at the top of the page is a real heading. So this renders a `<section>` with
 * a `<p>` label by default, and takes `headingLevel` for the cases where the section
 * genuinely belongs in the document outline.
 *
 * The shadow is Figma's `Card Shadow` effect style, which is `--pl-shadow-raised`
 * exactly — no new token.
 */

export interface DetailSectionProps {
  /** Field-group label. 14px medium secondary, not a heading. */
  label: ReactNode;
  /**
   * Rendered after the label as "(8)" — Figma's `Event Contributions (8)`.
   * A number, so it can be folded into the accessible name.
   */
  count?: number;
  /** Top-right control. Usually `<LinkButton iconStart="pencil">Edit</LinkButton>`. */
  action?: ReactNode;
  /**
   * Promote the label into the document outline. Use only when the section is a
   * genuine heading — most of this page's sections are not.
   */
  headingLevel?: 2 | 3;
  /**
   * Wrap the body in the sunken panel (`#f8fafc`, radius 8, 16px padding).
   * On by default: eight of the nine Figma sections have it. Turn it off when the
   * body brings its own surfaces, such as a grid of cards.
   */
  sunken?: boolean;
  children: ReactNode;
  className?: string;
  /** Classes for the inner panel — usually to change its padding. */
  bodyClassName?: string;
}

export function DetailSection({
  label,
  count,
  action,
  headingLevel,
  sunken = true,
  children,
  className,
  bodyClassName,
}: DetailSectionProps) {
  const Heading = headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "p";

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-raised",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <Heading className="m-0 text-base font-medium tracking-body text-secondary">
            {label}
            {typeof count === "number" && (
              <>
                {" "}
                <span className="text-tertiary">({count})</span>
              </>
            )}
          </Heading>
          {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
        </div>

        <div
          className={cn(
            sunken && "rounded-lg bg-surface-subtle p-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/* ── description list ──────────────────────────────────────────────────── */

export interface DescriptionListItem {
  label: ReactNode;
  value: ReactNode;
}

export interface DescriptionListProps {
  items: DescriptionListItem[];
  /**
   * Columns at `md` and up. Figma's Fund Details uses 4 equal columns; below `md`
   * it stacks, because four label/value pairs in 320px is unreadable.
   */
  columns?: 2 | 3 | 4;
  className?: string;
}

const COLS = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
} as const;

/**
 * DescriptionList — the label-over-value grid inside a `DetailSection`.
 *
 * A real `<dl>`, so the pairing is in the markup rather than implied by position.
 * That is the whole reason this is a component: the Figma frame is four `<div>`s
 * with two `<p>`s each, which reads to a screen reader as eight loose strings.
 */
export function DescriptionList({
  items,
  columns = 4,
  className,
}: DescriptionListProps) {
  return (
    <dl className={cn("m-0 grid grid-cols-1 gap-4", COLS[columns], className)}>
      {items.map((item, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-2">
          <dt className="text-xs leading-tight tracking-body text-secondary">
            {item.label}
          </dt>
          <dd className="m-0 text-base font-medium leading-normal tracking-body text-secondary">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

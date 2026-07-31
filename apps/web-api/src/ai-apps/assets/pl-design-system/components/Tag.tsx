import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Tag — the outlined pill used for focus areas, skills and team categories.
 * Appears on the teams grid, team profile, and jobs pages.
 */
/**
 * `outline` is the default listing chip, `filled` is the grey solid one Figma uses
 * for a qualifier that is not filterable ("Stage: Seed"), and `brand` is the
 * selected/active treatment used by filter rails.
 */
export type TagTone = "outline" | "filled" | "brand";

export interface TagProps {
  children: ReactNode;
  tone?: TagTone;
  /**
   * Shorthand for `tone="brand"`, kept so existing filter rails keep working.
   * @deprecated Use `tone="brand"`.
   */
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

const TONES: Record<TagTone, string> = {
  outline: "border-border bg-surface text-secondary",
  filled: "border-transparent bg-action-neutral-light text-secondary",
  brand: "border-border-brand bg-selected text-brand",
};

export function Tag({ children, tone, selected, onClick, className }: TagProps) {
  const interactive = typeof onClick === "function";
  const Element = interactive ? "button" : "span";

  return (
    <Element
      {...(interactive
        ? { type: "button" as const, onClick, "aria-pressed": !!selected }
        : {})}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
        "rounded-pill border px-2 py-0.5",
        "text-xs font-medium tracking-body",
        TONES[tone ?? (selected ? "brand" : "outline")],
        interactive && "cursor-pointer transition-colors hover:bg-hover",
        className,
      )}
    >
      {children}
    </Element>
  );
}

/**
 * TagList — renders tags with a `+N` overflow chip.
 *
 * The captured pages hardcoded the overflow count into content data
 * ({ label: "+1" }), so it could not respond to layout. This computes it.
 */
export interface TagListProps {
  tags: string[];
  /** Tags shown before collapsing into `+N`. */
  max?: number;
  selected?: string[];
  onToggle?: (tag: string) => void;
  className?: string;
}

export function TagList({
  tags,
  max = 2,
  selected = [],
  onToggle,
  className,
}: TagListProps) {
  const visible = tags.slice(0, max);
  const overflow = tags.length - visible.length;

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {visible.map((tag) => (
        <Tag
          key={tag}
          selected={selected.includes(tag)}
          onClick={onToggle ? () => onToggle(tag) : undefined}
        >
          {tag}
        </Tag>
      ))}
      {overflow > 0 && (
        <Tag
          className="text-tertiary"
          // The remaining tags belong in the accessible name, not just "+N".
        >
          <span aria-hidden="true">{`+${overflow}`}</span>
          <span className="sr-only">{`and ${overflow} more: ${tags
            .slice(max)
            .join(", ")}`}</span>
        </Tag>
      )}
    </div>
  );
}

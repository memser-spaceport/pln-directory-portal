import { useId, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * ExpandableText — long prose, clamped, with a "Show More" control.
 *
 * The About panel on the Figma `Team Page` (`Team/Profile details`, node
 * 27043:33273): three lines, a fade into the background, and a centred link.
 *
 * Three things this gets right that a naive version does not:
 *
 *   1. **The text is never removed from the DOM.** It is clamped with
 *      `-webkit-line-clamp`, so the browser's own Ctrl+F still finds it and a
 *      screen reader still reads it. Truncating by slicing the string would hide
 *      content from both.
 *   2. **The fade is `pointer-events-none`** and sits over the *last* line rather
 *      than below it, so it never eats a click or obscures a whole line of text.
 *   3. **The control is a real button** with `aria-expanded`, wired to the panel —
 *      not a styled `<a href="#">`.
 */

export interface ExpandableTextProps {
  children: ReactNode;
  /** Lines shown when collapsed. Figma uses 3. */
  lines?: 2 | 3 | 4 | 5 | 6;
  collapsedLabel?: string;
  expandedLabel?: string;
  /**
   * Accessible name for the toggle, e.g. "Randamu's description". Without it the
   * button announces only "Show More", which is meaningless out of context.
   */
  label?: string;
  className?: string;
}

const CLAMP = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
} as const;

export function ExpandableText({
  children,
  lines = 3,
  collapsedLabel = "Show More",
  expandedLabel = "Show Less",
  label,
  className,
}: ExpandableTextProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative">
        <div
          id={id}
          className={cn(
            "text-base leading-relaxed tracking-body text-secondary",
            !open && CLAMP[lines],
          )}
        >
          {children}
        </div>
        {!open && (
          /* Fades the final line into the panel rather than covering it. On the
             sunken panel this needs the panel's own colour, so it is a token
             gradient rather than `to-white`. */
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-surface-subtle"
          />
        )}
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "mt-1 cursor-pointer self-center rounded-sm px-1",
          "text-base font-medium tracking-body text-link transition-colors",
          "hover:text-brand hover:underline hover:underline-offset-2",
          "outline-none focus-visible:ring-2 focus-visible:ring-action-ring",
        )}
      >
        {open ? expandedLabel : collapsedLabel}
        {label && <span className="sr-only"> — {label}</span>}
      </button>
    </div>
  );
}

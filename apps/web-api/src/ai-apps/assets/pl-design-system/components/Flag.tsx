import { cn } from "../lib/cn";

/**
 * Flag — a country mark, framed and clipped.
 *
 * The Figma `Table Cell` set has two flag cells: `Only Flag` (node 14938:8372)
 * renders a circular crop, `Flag + Country name` (node 14950:51690) a small
 * rectangle beside a 14px label. Both are the same artwork in a different frame,
 * which is what `shape` selects here.
 *
 * The design system deliberately ships no flag artwork — 250 country files is
 * weight the system should not carry, and flag renderings are politically
 * contested in ways a component library should not adjudicate. Pass `src`; the
 * app owns the asset. Regional-indicator emoji are not an option: they do not
 * render as flags on Windows.
 */

export type FlagSize = "sm" | "md" | "lg";
export type FlagShape = "rect" | "circle";

export interface FlagProps {
  /** The flag image. Any format an `<img>` accepts. */
  src: string;
  /** Country name, for the accessible name. Not the ISO code — say "Bangladesh". */
  country: string;
  size?: FlagSize;
  shape?: FlagShape;
  className?: string;
}

/* Rect keeps a 4:3 ratio; circle is square. `lg` circle is Figma's 32px. */
const RECT: Record<FlagSize, string> = {
  sm: "h-3 w-4",
  md: "h-[15px] w-5",
  lg: "h-[21px] w-7",
};

const CIRCLE: Record<FlagSize, string> = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
};

export function Flag({
  src,
  country,
  size = "md",
  shape = "rect",
  className,
}: FlagProps) {
  return (
    <img
      src={src}
      alt={country}
      className={cn(
        "block shrink-0 object-cover",
        /* The hairline stops a white-heavy flag from dissolving into the row. */
        "ring-1 ring-inset ring-table-border",
        shape === "circle" ? CIRCLE[size] : RECT[size],
        shape === "circle" ? "rounded-full" : "rounded-sm",
        className,
      )}
    />
  );
}

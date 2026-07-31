import { cn } from "../lib/cn";

/**
 * Trend — a signed delta: caret plus percentage.
 *
 * The Figma `Icon & text` cell (node 14938:8413): a 20px `Icon / CaretUp`
 * beside a 14px semibold value on a 6px gap, coloured
 * `foreground/success/primary` (#0a9952).
 *
 * Only the rising case exists in the Figma set. The falling and flat cases are
 * added here, because a delta component that can only go up is not a delta
 * component. Falling uses the error ramp; flat drops to secondary text, since
 * "no change" is not a warning.
 *
 * Direction is never carried by colour alone — the caret rotates, and the
 * accessible label spells the direction out.
 */

export type TrendDirection = "up" | "down" | "flat";

export interface TrendProps {
  /** The delta as a number, e.g. `8` or `-2.4`. Sign sets the direction. */
  value: number;
  /** Unit suffix. `%` matches Figma; pass `""` for a bare count. */
  unit?: string;
  /**
   * Force the direction. By default the sign of `value` decides, and exactly 0
   * is flat. Override when a falling number is the good outcome — churn, spend,
   * time-to-merge.
   */
  direction?: TrendDirection;
  /** Invert the colour mapping: down is good, up is bad. */
  inverted?: boolean;
  className?: string;
}

const TONE: Record<TrendDirection, string> = {
  up: "text-trend-up",
  down: "text-trend-down",
  flat: "text-secondary",
};

function Caret({ direction }: { direction: TrendDirection }) {
  if (direction === "flat") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M4.5 10h11"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={direction === "down" ? "rotate-180" : undefined}
    >
      {/* Solid triangle matching Figma's Icon / CaretUp: inset 15.6% at the
          sides, 28.1% from the top, 34.4% from the bottom. */}
      <path d="M10 5.625L16.875 13.125H3.125L10 5.625Z" fill="currentColor" />
    </svg>
  );
}

const WORD: Record<TrendDirection, string> = {
  up: "up",
  down: "down",
  flat: "no change",
};

export function Trend({
  value,
  unit = "%",
  direction,
  inverted = false,
  className,
}: TrendProps) {
  const actual: TrendDirection =
    direction ?? (value > 0 ? "up" : value < 0 ? "down" : "flat");

  /* The caret always points the way the number moved; only the colour flips. */
  const toneKey: TrendDirection =
    inverted && actual !== "flat" ? (actual === "up" ? "down" : "up") : actual;

  const magnitude = Math.abs(value);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-base font-semibold tracking-body tabular-nums",
        TONE[toneKey],
        className,
      )}
    >
      <Caret direction={actual} />
      <span>
        {magnitude}
        {unit}
      </span>
      <span className="sr-only">{WORD[actual]}</span>
    </span>
  );
}

import { cn } from "../lib/cn";

/**
 * Rating — a five-star score, read-only.
 *
 * From the `Rating` cell of the Figma `Table Cell` set (node 14938:8412 ->
 * `_BaseRatingItem` 1361:26059/1361:26057), which has `Full` and `Half` item
 * types. The empty item is not drawn in the Figma set, so it is added here as
 * the same outline at track weight — without it a 2-star score would look like
 * a two-item list rather than 2 out of 5.
 *
 * Geometry is Figma's: a 24px item box with the glyph inset ~9.4%, laid out on
 * an 8px gap. Smaller sizes scale that ratio.
 */

export type RatingSize = "sm" | "md" | "lg";

export interface RatingProps {
  /** Score in stars, 0–`max`. Rounded to the nearest half. */
  value: number;
  max?: number;
  size?: RatingSize;
  /** Trailing numeric score, e.g. `4.5`. Off by default, as in Figma. */
  showValue?: boolean;
  className?: string;
}

/** Item box px and the gap between boxes, holding Figma's 24 : 8 ratio. */
const GEOM: Record<RatingSize, { box: number; gap: number }> = {
  sm: { box: 16, gap: 5 },
  md: { box: 20, gap: 7 },
  lg: { box: 24, gap: 8 },
};

/* One star path in a 24-unit box, sized to Figma's inset (glyph ~19.5 x 18.75,
   offset 2.25 from the left and top). Drawn once and reused for all three
   fills so a half star lines up exactly with a full one. */
const STAR =
  "M12 2.25l2.884 5.844 6.45.943-4.667 4.548 1.102 6.424L12 16.978 " +
  "6.231 20.01l1.102-6.425L2.666 9.037l6.45-.943L12 2.25z";

type Fill = "full" | "half" | "empty";

function Star({ fill, box }: { fill: Fill; box: number }) {
  return (
    <svg
      width={box}
      height={box}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {fill === "half" && (
        <defs>
          {/* Deterministic id: the same clip is fine to share across instances. */}
          <clipPath id="pl-rating-half">
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
      )}
      <path
        d={STAR}
        className="fill-none stroke-data-rating"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {fill !== "empty" && (
        <path
          d={STAR}
          className="fill-data-rating stroke-data-rating"
          strokeWidth="1.5"
          strokeLinejoin="round"
          clipPath={fill === "half" ? "url(#pl-rating-half)" : undefined}
        />
      )}
    </svg>
  );
}

export function Rating({
  value,
  max = 5,
  size = "md",
  showValue = false,
  className,
}: RatingProps) {
  const { box, gap } = GEOM[size];
  const score = Math.max(0, Math.min(max, Math.round(value * 2) / 2));

  const items: Fill[] = Array.from({ length: max }, (_, i) => {
    if (score >= i + 1) return "full";
    if (score >= i + 0.5) return "half";
    return "empty";
  });

  return (
    <span
      role="img"
      aria-label={`${score} out of ${max} stars`}
      className={cn("inline-flex items-center", className)}
      style={{ gap }}
    >
      {items.map((fill, i) => (
        <Star key={i} fill={fill} box={box} />
      ))}
      {showValue && (
        <span className="ml-1 text-sm font-medium tracking-body text-secondary tabular-nums">
          {score}
        </span>
      )}
    </span>
  );
}

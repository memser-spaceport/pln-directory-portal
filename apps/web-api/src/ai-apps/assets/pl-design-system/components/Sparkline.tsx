import { cn } from "../lib/cn";

/**
 * Sparkline — a wordless trend line for a table cell or a stat block.
 *
 * The Figma `Chart` cell (node 14938:36583) uses a flattened 72x36 vector from
 * the `Small chart line` set, `Color=Blue`. A picture of a trend cannot be
 * reused for real data, so this draws the same shape from a series instead:
 * same 2:1 box, same brand-blue stroke, same optional gradient wash.
 *
 * Purely decorative — it carries no axis, no scale and no accessible value.
 * Always pair it with the number it illustrates.
 */

export interface SparklineProps {
  /** The series. Two points minimum; scaled to fit, so units do not matter. */
  data: number[];
  width?: number;
  height?: number;
  /** Gradient wash under the line, as in the Figma asset. */
  area?: boolean;
  /** Dot on the final point — useful when the line ends mid-cell. */
  showLast?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  width = 72,
  height = 36,
  area = true,
  showLast = false,
  className,
}: SparklineProps) {
  if (data.length < 2) return null;

  /* Inset by the stroke half-width so peaks and troughs are not clipped. */
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((d - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const last = points[points.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      role="presentation"
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
    >
      {area && (
        <>
          <defs>
            {/* userSpaceOnUse anchors the fade to the box rather than the polygon's own
                bounding box, so a low line gets a faint wash instead of a
                full-strength one compressed into a few pixels. */}
            <linearGradient
              id="pl-sparkline-wash"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2={height}
            >
              <stop offset="0%" stopColor="var(--pl-data-line)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--pl-data-line)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`${line} ${width - pad},${height} ${pad},${height}`}
            fill="url(#pl-sparkline-wash)"
          />
        </>
      )}
      <polyline
        points={line}
        className="stroke-data-line"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLast && (
        <circle cx={last[0]} cy={last[1]} r="2.25" className="fill-data-line" />
      )}
    </svg>
  );
}

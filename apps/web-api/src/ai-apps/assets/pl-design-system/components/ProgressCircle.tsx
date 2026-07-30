import { cn } from "../lib/cn";

/**
 * ProgressCircle — the same meter as `ProgressBar`, wrapped into a ring.
 *
 * From the published Figma `Progress circle` set, sibling of `Progress Bar` on
 * the Progress page. Same track token, same two-colour gradient, same clamping
 * and the same accessibility contract — only the geometry differs.
 *
 * Pick the ring over the bar when the number sits in a tile or a card and there
 * is no natural full-width line for a bar to occupy. In a table row, use the bar.
 */

export type ProgressCircleSize = "sm" | "md" | "lg" | "xl";

export interface ProgressCircleProps {
  /** Completion, 0–100. Values outside the range are clamped. */
  value: number;
  size?: ProgressCircleSize;
  /** Show the percentage in the middle. */
  showValue?: boolean;
  /** Replaces the percentage — a count, a fraction, an icon. */
  children?: React.ReactNode;
  /** Accessible name. Required unless a visible heading already names it. */
  label?: string;
  className?: string;
}

/* Diameter, stroke and the type size that fits inside it. */
const GEOM: Record<ProgressCircleSize, { d: number; w: number; text: string }> = {
  sm: { d: 32, w: 4, text: "text-2xs" },
  md: { d: 48, w: 5, text: "text-xs" },
  lg: { d: 72, w: 6, text: "text-md" },
  xl: { d: 120, w: 8, text: "text-2xl" },
};

export function ProgressCircle({
  value,
  size = "md",
  showValue = true,
  children,
  label,
  className,
}: ProgressCircleProps) {
  const { d, w, text } = GEOM[size];
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  const r = (d - w) / 2;
  const c = 2 * Math.PI * r;
  const gradientId = `pl-progress-ring-${size}`;

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: d, height: d }}
    >
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true" className="-rotate-90">
        <defs>
          {/* Same stops as --pl-gradient-data. A CSS gradient cannot paint an SVG
              stroke, so the two stop colours are referenced individually and the
              angle is expressed as the gradient's own vector. */}
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0.75">
            <stop offset="17.5%" stopColor="var(--pl-blue-650)" />
            <stop offset="100%" stopColor="var(--pl-sky-400)" />
          </linearGradient>
        </defs>
        <circle
          cx={d / 2}
          cy={d / 2}
          r={r}
          fill="none"
          strokeWidth={w}
          className="stroke-data-track"
        />
        {pct > 0 && (
          <circle
            cx={d / 2}
            cy={d / 2}
            r={r}
            fill="none"
            strokeWidth={w}
            strokeLinecap="round"
            stroke={`url(#${gradientId})`}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
          />
        )}
      </svg>

      {(showValue || children) && (
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "font-semibold tracking-tight tabular-nums text-primary",
            text,
          )}
        >
          {children ?? `${pct}%`}
        </span>
      )}
    </div>
  );
}

import { cn } from "../lib/cn";

/**
 * ProgressBar — a completion meter with an optional trailing percentage.
 *
 * Taken from the `Progress` cell of the Figma `Table Cell` set (node
 * 14938:8383 -> `_BaseProgressBar` 14501:3904): a 10px pill track in
 * `background/neutral/subtle`, filled with the two-colour gradient style
 * `Gradients/2 Color/17`, and a 12px medium label 8px to its right.
 *
 * It is not table-specific — the same meter is the right control for a quota
 * row, an onboarding checklist or an OKR score.
 */

export type ProgressBarSize = "sm" | "md";

export interface ProgressBarProps {
  /** Completion, 0–100. Values outside the range are clamped. */
  value: number;
  size?: ProgressBarSize;
  /** Show the trailing `NN%` label. Figma has it on; turn it off in dense grids. */
  showValue?: boolean;
  /**
   * Accessible name. Required whenever the bar is not already labelled by a
   * visible header — a bare "50%" tells a screen reader nothing about what is
   * half done.
   */
  label?: string;
  className?: string;
}

const TRACK: Record<ProgressBarSize, string> = {
  sm: "h-1.5",
  md: "h-2.5",
};

export function ProgressBar({
  value,
  size = "md",
  showValue = true,
  label,
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={cn(
          "relative min-w-px flex-1 overflow-hidden rounded-pill bg-data-track",
          TRACK[size],
        )}
      >
        <div
          className="h-full rounded-pill bg-[image:var(--pl-gradient-data)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className="shrink-0 text-xs font-medium tracking-body text-secondary tabular-nums">
          {pct}%
        </span>
      )}
    </div>
  );
}

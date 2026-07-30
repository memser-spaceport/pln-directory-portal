import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * EmptyState — no results, no access, nothing yet.
 *
 * None of the 7 captured pages had one. The Gantry dashboard rendered a bare
 * navbar over blank canvas for an unauthorised visitor, which is exactly the
 * case this component exists to cover.
 */
export interface EmptyStateProps {
  title: string;
  description?: string;
  /** 24px icon or illustration. */
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg",
        "border border-dashed border-border bg-surface px-6 py-15 text-center",
        className,
      )}
    >
      {icon && <div className="text-tertiary">{icon}</div>}
      <h2 className="text-lg font-semibold text-primary tracking-title">{title}</h2>
      {description && (
        <p className="max-w-md text-base text-secondary tracking-body">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * SkeletonCard — loading placeholder matching EntityCard's box.
 * The captures are static snapshots, so no loading state was observable;
 * every list view needs one.
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-lg border border-border-subtle bg-surface p-4 shadow-card",
        className,
      )}
    >
      <div className="grid animate-pulse grid-cols-[auto_1fr] gap-3">
        <div className="h-8 w-8 rounded-sm bg-surface-sunken" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-1/3 rounded-sm bg-surface-sunken" />
          <div className="h-3 w-full rounded-sm bg-surface-sunken" />
          <div className="h-3 w-2/3 rounded-sm bg-surface-sunken" />
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { cn } from "../lib/cn";

/**
 * EntityCard — the directory's workhorse listing: logo, title, optional
 * count badge, a trailing action, and a clamped description.
 *
 * This one shape covers teams, projects, members, jobs and demo-day
 * participants. In the captures it was regenerated per page as `card-link`,
 * `feature-grid-item`, `media-card` and `media-card2` — four names, one
 * component, with a switch statement per listing.
 */
export interface EntityCardProps {
  title: string;
  href?: string;
  description?: string;
  logoSrc?: string;
  /** e.g. "4 updates". */
  badge?: string;
  /** Trailing control — typically a Follow button or overflow menu. */
  action?: ReactNode;
  /** Meta line rendered under the description. */
  meta?: ReactNode;
  /** Tags rendered at the card foot. */
  tags?: ReactNode;
  featured?: boolean;
  className?: string;
}

export function EntityCard({
  title,
  href,
  description,
  logoSrc,
  badge,
  action,
  meta,
  tags,
  featured,
  className,
}: EntityCardProps) {
  return (
    <Card href={href} featured={featured} className={cn("min-w-0", className)}>
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <Avatar src={logoSrc} name={title} size="md" />

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h3
                className={cn(
                  "min-w-0 truncate text-lg font-semibold leading-relaxed",
                  "text-primary tracking-title",
                )}
              >
                {title}
              </h3>
              {badge && <Badge tone="info">{badge}</Badge>}
            </div>
            {action && <span className="shrink-0">{action}</span>}
          </div>

          {description && (
            <p className="line-clamp-2 text-xs leading-snug text-secondary tracking-body">
              {description}
            </p>
          )}

          {meta}
          {tags}
        </div>
      </div>
    </Card>
  );
}

import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * PageShell — the frame every directory page shares.
 *
 * The navbar was byte-identical across all 7 captured pages (including the
 * auth-gated Gantry board, which rendered nothing but this chrome). Treat it
 * as fixed furniture: pages own their content, never their frame.
 */
export interface PageShellProps {
  /** The app navbar. Render once, here. */
  navbar: ReactNode;
  children: ReactNode;
  /** Optional left filter rail — the teams/jobs/projects list pattern. */
  sidebar?: ReactNode;
  className?: string;
}

export function PageShell({ navbar, children, sidebar, className }: PageShellProps) {
  return (
    <div className="min-h-screen bg-canvas">
      {navbar}
      <main
        className={cn(
          "mx-auto w-full max-w-[var(--pl-container-max)] px-6 py-6 max-lg:px-4",
          className,
        )}
      >
        {sidebar ? (
          <div className="flex gap-6">
            <aside className="w-[var(--pl-sidebar-width)] shrink-0 max-lg:hidden">
              <div className="sticky top-[calc(var(--pl-navbar-height)+var(--pl-space-6))]">
                {sidebar}
              </div>
            </aside>
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

/**
 * PageHeader — title, count and actions above a list view.
 * Captured pages each invented their own; this is the shared one.
 */
export interface PageHeaderProps {
  title: string;
  /**
   * `lg` is the 32px/42px `Heading/Medium/strong` the Figma pages use for
   * "Members" and "Hey, John!". `md` (24px) is the older captured size and stays
   * the default so existing pages do not jump.
   */
  size?: "md" | "lg";
  /** Result count, rendered next to the title. */
  count?: number;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  size = "md",
  count,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h1
            className={cn(
              "font-semibold text-primary",
              size === "lg"
                ? "text-3xl leading-loose tracking-display"
                : "text-2xl tracking-title",
            )}
          >
            {title}
          </h1>
          {typeof count === "number" && (
            <span className="text-base text-tertiary tracking-body">({count})</span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-base text-secondary tracking-body">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * ListGrid — the responsive card grid used by teams, projects, jobs and
 * demo-day listings. Column counts follow the breakpoints observed in the
 * captured media queries.
 */
export function ListGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

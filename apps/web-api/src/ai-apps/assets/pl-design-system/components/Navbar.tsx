import { useState } from "react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "../lib/cn";

/**
 * Navbar — the app header.
 *
 * From the Figma `Header Desktop` instance that appears on all three page
 * designs: `Directory: Members`, `Home Page` and `Team Page` (1440 × 80).
 *
 * `PageShell` has always taken the navbar as an opaque `ReactNode`, with a comment
 * noting it was "byte-identical across all 7 captured pages" — and then never
 * turned it into a component, so every page rebuilt it. This is that component.
 *
 * Composed rather than configured: pass `NavItem`s, a search node and action nodes.
 * A single `items={[...]}` prop would have to grow a flag for every arrangement the
 * three pages already differ on.
 */

export interface NavbarProps {
  /** Brand mark, 48px in Figma. Wrap it in a link to home yourself. */
  logo: ReactNode;
  /** `NavItem`s. Hidden below `lg` and moved into the mobile sheet. */
  children?: ReactNode;
  /** Global search — a `SearchInput`. Figma sizes it 434px. */
  search?: ReactNode;
  /** Right-hand controls: `NavIconButton`s and the account trigger. */
  actions?: ReactNode;
  /** Accessible name, for when a page has more than one nav landmark. */
  label?: string;
  className?: string;
}

export function Navbar({
  logo,
  children,
  search,
  actions,
  label = "Main",
  className,
}: NavbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-[var(--pl-z-sticky)] w-full",
        "border-b border-border-subtle bg-surface",
        className,
      )}
    >
      <div className="mx-auto flex h-[var(--pl-navbar-height-compact)] w-full max-w-[var(--pl-container-max)] items-center gap-6 px-6 lg:h-[var(--pl-navbar-height)] max-lg:px-4">
        <div className="flex shrink-0 items-center">{logo}</div>

        {/* The nav list is the reason this is a <nav>; search and the account
            menu are not navigation and sit outside it. */}
        {children && (
          <nav aria-label={label} className="hidden min-w-0 items-center gap-4 lg:flex">
            {children}
          </nav>
        )}

        {search && (
          <div className="ml-auto hidden min-w-0 max-w-108 flex-1 md:flex">{search}</div>
        )}

        <div className={cn("flex shrink-0 items-center gap-2", !search && "ml-auto")}>
          {actions}
          {children && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls="pl-navbar-mobile"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "inline-flex size-10 cursor-pointer items-center justify-center rounded-lg lg:hidden",
                "text-secondary transition-colors hover:bg-hover hover:text-primary",
                "outline-none focus-visible:ring-2 focus-visible:ring-action-ring",
              )}
            >
              <Icon name={open ? "close" : "filter"} size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile disclosure rather than a Drawer: the nav is the page's own
          content, and trapping focus for a five-item list is heavier than the
          list deserves. */}
      {open && children && (
        <div
          id="pl-navbar-mobile"
          className="border-t border-border-subtle px-4 py-3 lg:hidden"
        >
          {search && <div className="mb-3 md:hidden">{search}</div>}
          <nav aria-label={`${label} (mobile)`} className="flex flex-col items-stretch gap-1">
            {children}
          </nav>
        </div>
      )}
    </header>
  );
}

/* ── nav item ──────────────────────────────────────────────────────────── */

export interface NavItemProps {
  children: ReactNode;
  href?: string;
  /** Leading 16px glyph — Figma gives every top-level item one. */
  icon?: IconName;
  /** Adds a trailing caret. Set when the item opens a menu. */
  hasMenu?: boolean;
  /** Marks the current section. Renders `aria-current="page"`. */
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function NavItem({
  children,
  href,
  icon,
  hasMenu,
  active,
  onClick,
  className,
}: NavItemProps) {
  const classes = cn(
    "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5",
    "text-base font-medium tracking-body whitespace-nowrap transition-colors",
    "outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2",
    active ? "bg-selected text-brand" : "text-secondary hover:bg-hover hover:text-primary",
    "max-lg:h-11 max-lg:w-full max-lg:justify-start",
    className,
  );

  const inner = (
    <>
      {icon && <Icon name={icon} size={16} />}
      {children}
      {hasMenu && <Icon name="caret-down" size={14} className="text-tertiary" />}
    </>
  );

  /* A menu trigger is a button even when it also has an href — announcing
     "link" for something that opens a panel in place is a lie. */
  if (href && !hasMenu) {
    return (
      <a href={href} aria-current={active ? "page" : undefined} className={classes}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-haspopup={hasMenu ? "menu" : undefined}
      className={classes}
    >
      {inner}
    </button>
  );
}

/* ── actions ───────────────────────────────────────────────────────────── */

export interface NavIconButtonProps {
  /** Accessible name. Required — an icon-only control has no other name. */
  label: string;
  icon: IconName;
  /**
   * Unread count. Rendered as a pill overlapping the top-right of the glyph, and
   * folded into the accessible name so it is not colour-and-position only.
   */
  count?: number;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function NavIconButton({
  label,
  icon,
  count,
  href,
  onClick,
  className,
}: NavIconButtonProps) {
  const showCount = typeof count === "number" && count > 0;
  const classes = cn(
    "relative inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg",
    "text-secondary transition-colors hover:bg-hover hover:text-primary",
    "outline-none focus-visible:ring-2 focus-visible:ring-action-ring",
    className,
  );

  const inner = (
    <>
      <Icon name={icon} size={20} />
      {showCount && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center",
            "rounded-pill border-2 border-surface bg-action px-1",
            "text-3xs font-semibold leading-4 text-action-fg tabular-nums",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </>
  );

  /* The count goes in the name, not just on screen: "Notifications, 3 unread". */
  const name = showCount ? `${label}, ${count} unread` : label;

  if (href) {
    return (
      <a href={href} aria-label={name} className={classes}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={name} className={classes}>
      {inner}
    </button>
  );
}

export interface NavAccountProps {
  /** The user's `Avatar`, 40px. */
  avatar: ReactNode;
  /** Accessible name for the trigger, e.g. "Account menu for John Doe". */
  label: string;
  onClick?: () => void;
  className?: string;
}

/**
 * NavAccount — avatar plus caret, as one trigger.
 *
 * Figma draws these as two separate instances, an `Avatar` and a 24px caret
 * `Icon Button`. They are one control: two adjacent tab stops that open the same
 * menu is a bug, not a feature.
 */
export function NavAccount({ avatar, label, onClick, className }: NavAccountProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="menu"
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-pill p-0.5 pr-1",
        "transition-colors hover:bg-hover",
        "outline-none focus-visible:ring-2 focus-visible:ring-action-ring",
        className,
      )}
    >
      {avatar}
      <Icon name="caret-down" size={16} className="text-tertiary" />
    </button>
  );
}

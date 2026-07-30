import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "../lib/cn";

/**
 * Link — a link inside a sentence.
 *
 * This should have existed before any of the cards. `--pl-text-link` has been in
 * the token layer from the start and `Card`/`EntityCard` have always taken an
 * `href`, but there was no component for the thing the Home Page needs: an
 * underlined brand link mid-paragraph ("Protocol Labs' vision"). Every prose block
 * in the product needs one.
 *
 * Underlined by default, and that is not decoration — in a paragraph, colour alone
 * does not mark a link for a colour-blind reader. Turn it off only where the link
 * is already obviously interactive from its position, never mid-sentence.
 */

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  /**
   * Drop the underline. Only for links that are visually obvious from context —
   * a nav item, a card title. Never inside running text.
   */
  plain?: boolean;
  /** Adds the outbound marker and the `rel`/`target` pair. */
  external?: boolean;
}

export function Link({
  children,
  plain,
  external,
  className,
  ...rest
}: LinkProps) {
  return (
    <a
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : null)}
      className={cn(
        "cursor-pointer text-link transition-colors",
        "hover:text-brand",
        "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2",
        plain ? "no-underline hover:underline" : "underline underline-offset-2",
        className,
      )}
      {...rest}
    >
      {children}
      {external && (
        <>
          <Icon name="arrow-up-right" size={14} className="ml-0.5 inline-block align-[-1px]" />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </a>
  );
}

/**
 * LinkButton — a brand action with no chrome.
 *
 * Figma calls it `Link button`; it is 20px tall and appears all over the Home Page
 * feed: "View more →", "37 People going", author names. `Button` cannot do this job
 * — its smallest size is 24px and it always carries a background, border or tint.
 *
 * Renders as `<a>` when given an `href` and `<button>` otherwise, because "View
 * more" navigates and "37 People going" opens a panel, and those are different
 * things to a keyboard and to a screen reader.
 */

export interface LinkButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Trailing glyph. `arrow-right` is the Figma default for "View more". */
  iconEnd?: IconName;
  /** Leading glyph. */
  iconStart?: IconName;
  /** 12px rather than 14px — for the meta row under a feed card. */
  size?: "sm" | "md";
  /**
   * Inherit the surrounding colour instead of brand. For author names and counts,
   * where a row of blue links would read as a menu.
   */
  muted?: boolean;
  className?: string;
}

export function LinkButton({
  children,
  href,
  onClick,
  iconEnd,
  iconStart,
  size = "md",
  muted,
  className,
}: LinkButtonProps) {
  const classes = cn(
    "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap",
    "font-medium tracking-body no-underline transition-colors",
    "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2",
    size === "sm" ? "text-xs" : "text-base",
    muted ? "text-secondary hover:text-primary" : "text-link hover:text-brand",
    /* Underline on hover only: a feed card carries six of these, and six
       permanently underlined strings is a thicket. The rule from `Link` does not
       apply because none of these sit inside a sentence. */
    "hover:underline hover:underline-offset-2",
    className,
  );

  const glyph = size === "sm" ? 14 : 16;
  const inner = (
    <>
      {iconStart && <Icon name={iconStart} size={glyph} />}
      {children}
      {iconEnd && <Icon name={iconEnd} size={glyph} />}
    </>
  );

  if (href) {
    return (
      <a href={href} onClick={onClick} className={classes}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {inner}
    </button>
  );
}

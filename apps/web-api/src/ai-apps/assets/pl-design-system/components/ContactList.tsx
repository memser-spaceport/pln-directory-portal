import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "../lib/cn";

/**
 * ContactList / ContactChip — the row of links on an entity page.
 *
 * From `Team/Contact Details` on the Figma `Team Page` (node 27043:33275):
 * website, email, LinkedIn, X, Telegram, Calendly, blog — each a circular mark
 * followed by its value.
 *
 * ## Why brand marks are the caller's job
 *
 * Three of those seven are trademarks. They are deliberately **not** in `Icon`:
 * they are not drawn on the Phosphor grid, they carry their own brand colours rather
 * than `currentColor`, and their usage is governed by rules a component library
 * should not silently reinterpret. Figma keeps them in a separate `Brand logo / *`
 * set, which is the right split.
 *
 * So `ContactChip` takes either a `kind` — for the generic ones, which use the
 * system icon set — or an arbitrary `mark` node for anything branded. The app owns
 * the trademark, exactly as it owns flag artwork for `Flag`, and for the same
 * reasons. The stories draw simplified marks inline so the docs render offline;
 * they are illustrative, not a shipped set.
 */

/** Contact kinds the system icon set can express on its own. */
export type ContactKind = "website" | "email" | "calendar" | "blog" | "chat";

const KIND: Record<ContactKind, { icon: IconName; noun: string; scheme?: string }> = {
  website: { icon: "globe", noun: "Website" },
  email: { icon: "mail", noun: "Email", scheme: "mailto:" },
  calendar: { icon: "calendar", noun: "Scheduling link" },
  blog: { icon: "book", noun: "Blog" },
  chat: { icon: "chat", noun: "Chat" },
};

export interface ContactChipProps {
  /** The visible value — a handle or a URL, as shown. */
  children: ReactNode;
  href?: string;
  /** Generic contact type, drawn from the system icon set. */
  kind?: ContactKind;
  /**
   * A branded mark — LinkedIn, X, Telegram. Supply the artwork; it renders inside
   * a 20px circle. Takes precedence over `kind`.
   */
  mark?: ReactNode;
  /**
   * What this link *is*, for screen readers: "LinkedIn", "Telegram". Required when
   * using `mark`, since the artwork is silent. Derived from `kind` otherwise.
   */
  noun?: string;
  className?: string;
}

export function ContactChip({
  children,
  href,
  kind,
  mark,
  noun,
  className,
}: ContactChipProps) {
  const preset = kind ? KIND[kind] : undefined;
  const name = noun ?? preset?.noun ?? "Link";
  const resolvedHref =
    href ?? (preset?.scheme && typeof children === "string" ? preset.scheme + children : undefined);

  const inner = (
    <>
      <span
        aria-hidden="true"
        className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-action text-action-fg"
      >
        {mark ?? (preset && <Icon name={preset.icon} size={12} />)}
      </span>
      <span className="sr-only">{name}: </span>
      <span className="min-w-0 truncate">{children}</span>
    </>
  );

  const classes = cn(
    "inline-flex min-w-0 items-center gap-2",
    "text-base tracking-body text-secondary",
    href || resolvedHref
      ? "cursor-pointer rounded-sm transition-colors hover:text-link " +
          "outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2"
      : "",
    className,
  );

  if (resolvedHref) {
    return (
      <a href={resolvedHref} className={classes}>
        {inner}
      </a>
    );
  }
  return <span className={classes}>{inner}</span>;
}

export interface ContactListProps {
  children: ReactNode;
  className?: string;
}

/**
 * ContactList — wraps chips into rows with dividers between them on one line.
 *
 * A `<ul>`, because it is a list of contact points and a screen-reader user
 * benefits from hearing how many there are before walking them.
 */
export function ContactList({ children, className }: ContactListProps) {
  return (
    <ul
      className={cn(
        "m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-3 p-0",
        /* Hairline between chips on the same row, suppressed at row starts by the
           wrap — Figma draws these as separators inside a single flex row. */
        "[&>li]:flex [&>li]:min-w-0 [&>li]:items-center",
        className,
      )}
    >
      {children}
    </ul>
  );
}

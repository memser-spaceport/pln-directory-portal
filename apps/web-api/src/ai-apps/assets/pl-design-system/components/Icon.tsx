import type { SVGProps } from "react";
import { cn } from "../lib/cn";

/**
 * Icon — the product's only source of glyphs.
 *
 * Before this, every story hand-rolled inline SVG: 18 of them across 10 files,
 * with `Cube` duplicated three times in two different colour treatments. That is
 * the problem this solves — not the drawing, the *single source*.
 *
 * ## Curated, not synced
 *
 * Figma has a published `Design System Icons | Protocol Labs` library with several
 * hundred glyphs. This registry holds only the ones the product actually uses, for
 * three reasons: a few hundred SVGs is weight every consumer pays for, a sync step
 * needs a Figma token and CI that does not exist yet, and an icon nobody uses is an
 * icon nobody has checked.
 *
 * Adding a glyph is deliberately a one-line edit to `GLYPHS` below. When the set
 * outgrows hand-maintenance — or when the design team wants the library to be
 * authoritative — replace `GLYPHS` with a generated file and keep this component
 * and its API unchanged. Nothing downstream needs to know.
 *
 * ## Drawing rules
 *
 * Every glyph is a 24×24 viewBox with a 1.5 stroke on `currentColor`, round caps
 * and round joins, matching the Phosphor family the Figma library is drawn from.
 * Solid shapes are the exception and are noted. Because the stroke is not scaled,
 * a 16px icon has a proportionally heavier line than a 24px one — which is correct:
 * a hairline at 16px disappears.
 */

export type IconName =
  /* navigation + chrome */
  | "caret-down"
  | "caret-up"
  | "caret-left"
  | "caret-right"
  | "caret-up-down"
  | "arrow-right"
  | "arrow-up-right"
  | "close"
  | "check"
  | "minus"
  | "kebab"
  /* objects + wayfinding */
  | "search"
  | "folder"
  | "calendar"
  | "calendar-star"
  | "chat"
  | "grid"
  | "cube"
  | "book"
  | "map-pin"
  | "globe"
  | "mail"
  | "link"
  | "bell"
  | "help"
  | "info"
  | "user-circle"
  | "eye"
  | "thumbs-up"
  /* actions */
  | "pencil"
  | "trash"
  | "copy"
  | "plus"
  | "filter"
  | "upload";

/** Path data only. `stroke` glyphs inherit the shared stroke attributes. */
type Glyph = { d: string; solid?: boolean };

const GLYPHS: Record<IconName, Glyph> = {
  /* ── navigation + chrome ──────────────────────────────────────────────── */
  "caret-down": { d: "M6 9.75 12 15.75 18 9.75Z", solid: true },
  "caret-up": { d: "M6 14.25 12 8.25 18 14.25Z", solid: true },
  "caret-left": { d: "M14.25 6 8.25 12 14.25 18Z", solid: true },
  "caret-right": { d: "M9.75 6 15.75 12 9.75 18Z", solid: true },
  /* Two triangles — the unsorted-column affordance. */
  "caret-up-down": { d: "M12 4 16 9H8ZM12 20 8 15h8Z", solid: true },
  "arrow-right": { d: "M4.5 12h15m0 0-6-6m6 6-6 6" },
  "arrow-up-right": { d: "M7 17 17 7m0 0h-7.5m7.5 0v7.5" },
  close: { d: "M6 6l12 12M18 6 6 18" },
  check: { d: "m5 12.5 4.5 4.5L19 7.5" },
  minus: { d: "M6 12h12" },
  kebab: {
    d:
      "M10.85 6a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 1 0-2.3 0Z" +
      "M10.85 12a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 1 0-2.3 0Z" +
      "M10.85 18a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 1 0-2.3 0Z",
    solid: true,
  },

  /* ── objects + wayfinding ─────────────────────────────────────────────── */
  search: { d: "M10.75 18.5a7.75 7.75 0 1 0 0-15.5 7.75 7.75 0 0 0 0 15.5Zm5.6-2.15L21 21" },
  folder: { d: "M3.5 6.5A1.5 1.5 0 0 1 5 5h3.9a1.5 1.5 0 0 1 1.06.44l1.1 1.1a1.5 1.5 0 0 0 1.07.46H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" },
  calendar: { d: "M4.5 7.5A1.5 1.5 0 0 1 6 6h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-11ZM8 3.5V6m8-2.5V6M4.5 10.5h15" },
  "calendar-star": { d: "M4.5 7.5A1.5 1.5 0 0 1 6 6h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-11ZM8 3.5V6m8-2.5V6M4.5 10.5h15M12 12.5l1.2 2.4 2.6.4-1.9 1.85.45 2.6L12 18.5l-2.35 1.25.45-2.6-1.9-1.85 2.6-.4L12 12.5Z" },
  chat: { d: "M8 15.5H5.5A1.5 1.5 0 0 1 4 14V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V14a1.5 1.5 0 0 1-1.5 1.5H13l-3.5 3.5v-3.5Z" },
  grid: { d: "M4.5 5.5A1 1 0 0 1 5.5 4.5h3.6a1 1 0 0 1 1 1v3.6a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V5.5Zm9.4 0a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v3.6a1 1 0 0 1-1 1h-3.6a1 1 0 0 1-1-1V5.5ZM4.5 14.9a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v3.6a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1v-3.6Zm9.4 0a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v3.6a1 1 0 0 1-1 1h-3.6a1 1 0 0 1-1-1v-3.6Z" },
  cube: { d: "M12 2.75 20.25 7.25v9.5L12 21.25 3.75 16.75v-9.5L12 2.75ZM3.75 7.25 12 11.75l8.25-4.5M12 11.75V21.25" },
  book: { d: "M5 5.5h5.5a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2H5v-11.5Zm14 0h-5.5A2.5 2.5 0 0 0 11 8v11a2 2 0 0 1 2-2h6v-11.5Z" },
  globe: { d: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5C9.8 18.2 8.6 15.2 8.6 12S9.8 5.8 12 3.5Z" },
  mail: { d: "M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-9Zm.6-.6 7.1 5.7a1.25 1.25 0 0 0 1.6 0l7.1-5.7" },
  link: { d: "M9.5 14.5 14.5 9.5M10.2 6.6l1.4-1.4a3.6 3.6 0 0 1 5.1 5.1l-1.4 1.4m-1.5 1.7-1.4 1.4a3.6 3.6 0 0 1-5.1-5.1l1.4-1.4" },
  "map-pin": { d: "M12 21.5s6.75-5.6 6.75-11a6.75 6.75 0 1 0-13.5 0c0 5.4 6.75 11 6.75 11Zm0-8.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z" },
  bell: { d: "M6 10a6 6 0 0 1 12 0c0 3.4.9 5.2 1.6 6.1a.75.75 0 0 1-.6 1.2H5a.75.75 0 0 1-.6-1.2C5.1 15.2 6 13.4 6 10ZM9.5 17.3a2.6 2.6 0 0 0 5 0" },
  help: { d: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM9.6 9.65A2.5 2.5 0 1 1 12 13.1v1.15M12 16.9v.01" },
  info: { d: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 11.25v5M12 7.6v.01" },
  "user-circle": { d: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Zm0-9.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm-5.6 7.35a6.6 6.6 0 0 1 11.2 0" },
  eye: { d: "M2.5 12S5.9 6 12 6s9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Zm9.5 2.9a2.9 2.9 0 1 0 0-5.8 2.9 2.9 0 0 0 0 5.8Z" },
  "thumbs-up": { d: "M7.5 20.5V10.2l3.6-6.7a2 2 0 0 1 2.9 2.6L12.5 9h5.4a2 2 0 0 1 2 2.4l-1.3 7A2 2 0 0 1 16.6 20H7.5Zm0 0H4.7a1.2 1.2 0 0 1-1.2-1.2v-7.9a1.2 1.2 0 0 1 1.2-1.2h2.8" },

  /* ── actions ──────────────────────────────────────────────────────────── */
  pencil: { d: "M16.8 3.7 20.3 7.2 8.5 19H5v-3.5L16.8 3.7Z" },
  trash: { d: "M4.5 6.75h15M9.75 6.75V4.5h4.5v2.25M6.75 6.75l.9 12.75h8.7l.9-12.75M10 10.5v5.25m4-5.25v5.25" },
  copy: { d: "M8.5 8.5V5.5A1 1 0 0 1 9.5 4.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3M4.5 9.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9Z" },
  plus: { d: "M12 5.25v13.5M5.25 12h13.5" },
  filter: { d: "M4 6.5h16M7 12h10m-7 5.5h4" },
  upload: { d: "M12 16.5V4.5m0 0L7.5 9M12 4.5 16.5 9M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15" },
};

/** Every glyph name, for stories and for iterating the set. */
export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  name: IconName;
  /** Edge length in px. Inherits `currentColor` at any size. */
  size?: number;
  /**
   * Accessible name. **Omit it** — the default — when the icon sits beside text
   * that already says the same thing, which is most of the time. Only set it when
   * the icon is the sole carrier of meaning, and then say what it *means*, not what
   * it looks like: "Sorted ascending", never "caret up".
   */
  label?: string;
}

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  const glyph = GLYPHS[name];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      /* Decorative by default. An icon repeating its neighbouring label is noise
         in a screen reader, and that is the overwhelmingly common case. */
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
      {...(glyph.solid
        ? { fill: "currentColor" }
        : {
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.5,
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
          })}
      {...rest}
    >
      <path d={glyph.d} />
    </svg>
  );
}

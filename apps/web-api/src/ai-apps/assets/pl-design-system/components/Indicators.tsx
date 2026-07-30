import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "../lib/cn";

/**
 * Three small primitives the Home Page cards are built from. Each is a handful of
 * lines, and each was being hand-rolled per card in Figma.
 */

/* ── IconTile ──────────────────────────────────────────────────────────── */

/**
 * IconTile — a glyph in a tinted circle.
 *
 * Figma names it `Round - Icon Button`, but in these layouts it is not a button:
 * it labels a card, it does not act. `IconButton` is the interactive one — square,
 * untinted, and it requires an accessible name. This is decoration, so it is a
 * `<span>` and takes no label.
 */

export type IconTileTone = "brand" | "neutral" | "success" | "warning" | "danger";
export type IconTileSize = "sm" | "md" | "lg";

const TILE_TONE: Record<IconTileTone, string> = {
  brand: "bg-selected text-brand",
  neutral: "bg-action-neutral-light text-secondary",
  success: "bg-action-success-light text-trend-up",
  warning: "bg-action-warning-light text-action-warning-fg",
  danger: "bg-action-error-light text-trend-down",
};

const TILE_SIZE: Record<IconTileSize, { box: string; glyph: number }> = {
  sm: { box: "size-8", glyph: 16 },
  md: { box: "size-10", glyph: 20 },
  lg: { box: "size-12", glyph: 24 },
};

export interface IconTileProps {
  name: IconName;
  tone?: IconTileTone;
  size?: IconTileSize;
  className?: string;
}

export function IconTile({
  name,
  tone = "brand",
  size = "md",
  className,
}: IconTileProps) {
  const { box, glyph } = TILE_SIZE[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        box,
        TILE_TONE[tone],
        className,
      )}
    >
      <Icon name={name} size={glyph} />
    </span>
  );
}

/* ── MetaChip ──────────────────────────────────────────────────────────── */

/**
 * MetaChip — a glyph and a short value, inline.
 *
 * Figma's `Date` and `Location` instances in the activity feed. Not a `Badge`:
 * a badge states a category and has a fill; this states a fact and has none, so it
 * can sit inside a heading line without competing with it.
 */

export interface MetaChipProps {
  icon: IconName;
  children: ReactNode;
  /**
   * What the value *is*, for screen readers — "Date", "Location". Without it the
   * glyph is silent and the reader hears a bare "9 December, 2025".
   */
  label?: string;
  className?: string;
}

export function MetaChip({ icon, children, label, className }: MetaChipProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1",
        "text-base tracking-body text-secondary",
        className,
      )}
    >
      <Icon name={icon} size={16} className="text-tertiary" />
      {label && <span className="sr-only">{label}: </span>}
      {children}
    </span>
  );
}

/* ── BadgeDot ──────────────────────────────────────────────────────────── */

/**
 * BadgeDot — an unread marker. Figma's `_BaseBadgeDot`, 12px.
 *
 * A dot is colour-only by definition, so on its own it fails as an indicator.
 * `label` is therefore required, not optional: it supplies the visually hidden
 * text that makes the state readable. If you cannot name what the dot means, it
 * should not be there.
 */

export type BadgeDotTone = "brand" | "success" | "warning" | "danger" | "neutral";

const DOT_TONE: Record<BadgeDotTone, string> = {
  brand: "bg-action",
  success: "bg-action-success",
  warning: "bg-action-warning",
  danger: "bg-action-error",
  neutral: "bg-border-strong",
};

export interface BadgeDotProps {
  /** Visually hidden meaning, e.g. "Unread". Required. */
  label: string;
  tone?: BadgeDotTone;
  /** Softer treatment — a ring rather than a solid fill. */
  subtle?: boolean;
  className?: string;
}

export function BadgeDot({
  label,
  tone = "brand",
  subtle,
  className,
}: BadgeDotProps) {
  return (
    <span className={cn("inline-flex size-3 shrink-0 items-center justify-center", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "block rounded-full",
          subtle ? "size-3 opacity-30" : "size-1.5",
          DOT_TONE[tone],
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

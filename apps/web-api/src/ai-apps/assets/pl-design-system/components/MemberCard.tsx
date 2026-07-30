import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { cn } from "../lib/cn";

/**
 * MemberCard — the portrait card in the members directory.
 *
 * From the Figma `Member Card` instance on `Directory: Members Desktop`
 * (node 27045:78566), 289 × 236.
 *
 * Deliberately **not** a variant of `EntityCard`. That one is horizontal — logo
 * left, title and clamped description right, trailing action. This is vertical and
 * centred, with a gradient cover band, a ringed portrait, and a pill that straddles
 * the band edge. Forcing both through one component is exactly the "four names, one
 * component, a switch statement per listing" problem `EntityCard`'s own doc comment
 * was written to warn about.
 *
 * Three things here exist nowhere else in the system: the cover gradient
 * (`--pl-gradient-cover`, Figma's `Member Card Gradient`), the concentric ring halo
 * behind the avatar, and a badge positioned to overlap two regions of the card.
 */

/** Figma's `avatar/custom background/*` set, as semantic slots. */
export type MemberCardTint =
  | "slate" | "mint" | "sky" | "peach" | "lilac" | "butter" | "periwinkle" | "sand" | "mist";

const TINT: Record<MemberCardTint, string> = {
  slate: "var(--pl-avatar-tint-1)",
  mint: "var(--pl-avatar-tint-2)",
  sky: "var(--pl-avatar-tint-3)",
  peach: "var(--pl-avatar-tint-4)",
  lilac: "var(--pl-avatar-tint-5)",
  butter: "var(--pl-avatar-tint-6)",
  periwinkle: "var(--pl-avatar-tint-7)",
  sand: "var(--pl-avatar-tint-8)",
  mist: "var(--pl-avatar-tint-9)",
};

const TINT_ORDER: MemberCardTint[] = [
  "slate", "mint", "sky", "peach", "lilac", "butter", "periwinkle", "sand", "mist",
];

/**
 * Pick a stable tint from the person's name, so the same person is always the same
 * colour and a grid of cards is varied without the caller choosing.
 */
function tintFor(name: string): MemberCardTint {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return TINT_ORDER[h % TINT_ORDER.length]!;
}

/**
 * The halo — two concentric rings behind the portrait. Figma flattens these to
 * `inner-circle.svg` (106px) and `outer-circle.svg` (150 × 147); redrawn here so
 * they scale and inherit a token colour rather than shipping as two raster assets.
 */
function Halo() {
  return (
    <svg
      viewBox="0 0 150 150"
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 size-[150px] -translate-x-1/2 -translate-y-1/2"
      fill="none"
    >
      {/* Navy alpha, not white: a white stroke vanishes against the top of the
          gradient and only appears near the slate-200 bottom, which reads as a
          rendering bug rather than a halo. */}
      <circle cx="75" cy="75" r="52.5" stroke="var(--pl-alpha-navy-12)" />
      <circle cx="75" cy="75" r="74.5" stroke="var(--pl-alpha-navy-06)" />
    </svg>
  );
}

export interface MemberCardProps {
  name: string;
  /** Portrait. Falls back to a tinted initial. */
  src?: string;
  /** Company or team. */
  organisation?: ReactNode;
  role?: ReactNode;
  /** Free-text place. Rendered with a map pin. */
  location?: ReactNode;
  /**
   * Shows the "Available to connect" pill on the cover edge. Figma's `Badge OH` —
   * office hours.
   */
  available?: boolean;
  /** Override the pill wording. */
  availableLabel?: string;
  /** Whole card becomes a link. */
  href?: string;
  /** Cover tint behind the portrait. Derived from the name when omitted. */
  tint?: MemberCardTint;
  className?: string;
}

export function MemberCard({
  name,
  src,
  organisation,
  role,
  location,
  available,
  availableLabel = "Available to connect",
  href,
  tint,
  className,
}: MemberCardProps) {
  const fill = TINT[tint ?? tintFor(name)];

  const body = (
    <>
      {/* Cover band. overflow-hidden here rather than on the card, so the pill
          below can hang past its lower edge. */}
      <div
        className="relative flex h-24 items-center justify-center overflow-hidden rounded-t-xl"
        style={{ backgroundImage: "var(--pl-gradient-cover)" }}
      >
        <Halo />
        {src ? (
          <img
            src={src}
            alt=""
            className="relative size-20 rounded-full object-cover"
            style={{ backgroundColor: fill }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="relative flex size-20 items-center justify-center rounded-full text-2xl font-semibold text-primary/60"
            style={{ backgroundColor: fill }}
          >
            {name.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {available && (
        /* Straddles the cover edge: -translate-y-1/2 on the band's bottom line, so
           it reads as attached to the portrait rather than to the text below. */
        <span
          className={cn(
            "absolute left-1/2 top-24 z-base -translate-x-1/2 -translate-y-1/2",
            "inline-flex items-center gap-1 rounded-pill border px-1.5 py-px",
            "border-border-brand-subtle text-3xs tracking-body text-brand",
          )}
          style={{ backgroundColor: "var(--pl-blue-25)" }}
        >
          <Icon name="calendar" size={12} />
          {availableLabel}
        </span>
      )}

      <div className="flex flex-col items-center gap-2 px-4 pb-6 pt-4 text-center">
        <p className="m-0 w-full truncate text-lg font-medium leading-relaxed tracking-title text-primary">
          {name}
        </p>
        {(organisation || role) && (
          <div className="flex w-full min-w-0 flex-col text-base leading-normal tracking-body text-secondary">
            {organisation && <span className="truncate">{organisation}</span>}
            {role && <span className="truncate">{role}</span>}
          </div>
        )}
        {location && (
          <span className="flex min-w-0 items-center gap-1 text-xs leading-tight tracking-body text-secondary">
            <Icon name="map-pin" size={16} className="text-tertiary" />
            <span className="truncate">{location}</span>
          </span>
        )}
      </div>
    </>
  );

  const frame = cn(
    "relative block w-full overflow-hidden rounded-xl bg-surface shadow-card",
    href &&
      "cursor-pointer transition-shadow hover:shadow-raised " +
        "outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2",
    className,
  );

  if (href) {
    /* One link wrapping the whole card, so a keyboard user gets one stop rather
       than four, and the accessible name is the person's name plus their details. */
    return (
      <a href={href} className={frame}>
        {body}
      </a>
    );
  }
  return <div className={frame}>{body}</div>;
}

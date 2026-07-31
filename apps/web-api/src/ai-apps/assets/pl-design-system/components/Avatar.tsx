import { cn } from "../lib/cn";

/**
 * Avatar — square-rounded entity image for teams, members and projects.
 * Captured at 24px (in stacks) and 32px (on cards).
 */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizes: Record<AvatarSize, string> = {
  xs: "h-5 w-5",
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  /* 80px — the entity logo at the top of a Team page (Figma 27043:33273). */
  xl: "h-20 w-20",
};

/* The initial has to grow with the box or an 80px avatar shows a 11px letter. */
const initialSize: Record<AvatarSize, string> = {
  xs: "text-2xs",
  sm: "text-2xs",
  md: "text-xs",
  lg: "text-lg",
  xl: "text-3xl",
};

export interface AvatarProps {
  src?: string;
  /** Entity name — used for the alt text and the initial fallback. */
  name: string;
  size?: AvatarSize;
  /** Circular for people, rounded-square for teams/projects (the default). */
  shape?: "square" | "circle";
  className?: string;
}

export function Avatar({
  src,
  name,
  size = "md",
  shape = "square",
  className,
}: AvatarProps) {
  const shapeClass =
    shape === "circle" ? "rounded-full" : size === "xl" ? "rounded-xl" : "rounded-sm";

  if (!src) {
    return (
      <span
        role="img"
        aria-label={name}
        className={cn(
          "flex shrink-0 items-center justify-center border border-border",
          "bg-surface-sunken font-medium text-tertiary uppercase",
          initialSize[size],
          sizes[size],
          shapeClass,
          className,
        )}
      >
        {name.trim().charAt(0)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={cn(
        "block shrink-0 border border-border object-cover",
        sizes[size],
        shapeClass,
        className,
      )}
    />
  );
}

/**
 * AvatarStack — overlapping avatars with a `+N` remainder.
 *
 * Rebuilt against the Figma `Avatar Group` set (node 14901:28399), which has
 * six sizes and holds up to seven people plus the remainder chip. Three things
 * differ from the previous implementation, all of them from Figma:
 *
 *   - Avatars are CIRCULAR in a group, whatever their shape elsewhere. Squares
 *     with rounded corners do not tile into a legible overlap.
 *   - The separating ring is white (`border/base/white`) and scales with the
 *     size — 1px at 20px, 3px at 64px — not a fixed 2px surface ring.
 *   - The remainder is a real avatar-sized chip in brand blue with white text,
 *     not a bare `+N` label floating after the stack.
 *
 * Overlap is Figma's, derived from the published variant widths: the box shifts
 * left by 4 / 4 / 6 / 8 / 12 / 14 px as the size grows.
 */

export type AvatarStackSize = "tiny" | "xs" | "sm" | "md" | "lg" | "xl";

interface StackGeom {
  /** Avatar diameter, px. */
  box: number;
  /** Negative margin between avatars, px. */
  overlap: number;
  /** White separating ring, px. */
  ring: number;
  /** Remainder chip type size, px. */
  chip: number;
}

const STACK: Record<AvatarStackSize, StackGeom> = {
  tiny: { box: 20, overlap: 4, ring: 1, chip: 11 },
  xs: { box: 24, overlap: 4, ring: 1.5, chip: 11 },
  sm: { box: 32, overlap: 6, ring: 2, chip: 12 },
  md: { box: 40, overlap: 8, ring: 2, chip: 14 },
  lg: { box: 56, overlap: 12, ring: 3, chip: 18 },
  xl: { box: 64, overlap: 14, ring: 3, chip: 24 },
};

export interface AvatarStackProps {
  people: Array<{ name: string; src?: string }>;
  /**
   * How many faces to show before collapsing to `+N`. Figma tops out at seven.
   */
  max?: number;
  size?: AvatarStackSize;
  /**
   * Drop the `+N` chip and let the names carry the remainder. Use when the
   * count is already stated nearby.
   */
  hideOverflow?: boolean;
  className?: string;
}

export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  hideOverflow = false,
  className,
}: AvatarStackProps) {
  const { box, overlap, ring, chip } = STACK[size];
  const visible = people.slice(0, Math.min(max, 7));
  const overflow = people.length - visible.length;
  const showChip = overflow > 0 && !hideOverflow;

  return (
    <span
      role="img"
      aria-label={
        overflow > 0
          ? `${visible.map((p) => p.name).join(", ")} and ${overflow} more`
          : visible.map((p) => p.name).join(", ")
      }
      className={cn("inline-flex items-center", className)}
    >
      {visible.map((person, i) => (
        <span
          key={person.name}
          /* Later faces sit on top, so the stack reads left-to-right. */
          style={{
            width: box,
            height: box,
            marginRight: i === visible.length - 1 && !showChip ? 0 : -overlap,
            borderWidth: ring,
            zIndex: i,
          }}
          className="relative shrink-0 overflow-hidden rounded-full border-solid border-surface"
        >
          {person.src ? (
            <img
              src={person.src}
              alt=""
              className="block size-full rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-full items-center justify-center rounded-full bg-surface-sunken font-medium text-tertiary uppercase"
              style={{ fontSize: chip }}
            >
              {person.name.trim().charAt(0)}
            </span>
          )}
        </span>
      ))}

      {showChip && (
        <span
          aria-hidden="true"
          style={{
            width: box,
            height: box,
            borderWidth: ring,
            fontSize: chip,
            zIndex: visible.length,
          }}
          className={cn(
            "relative flex shrink-0 items-center justify-center",
            "rounded-full border-solid border-surface",
            "bg-action font-semibold tracking-tight text-action-fg",
          )}
        >
          {/* Below 24px there is no room for the plus sign; Figma drops it. */}
          {box <= 20 ? overflow : `+${overflow}`}
        </span>
      )}
    </span>
  );
}

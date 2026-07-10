// Avatar component types
// Figma source: Design System Icons canvas — "Avatar" (10:1763)
// File: apsV3GKbIbOSpZYGvhdKqU

// ─── Size ─────────────────────────────────────────────────────────────────────
// Token-style names, corrected pixel values from Figma "Avatar" component frame.
// Previous impl had xl=48 (Figma XL=64) and 3xl=80 (Figma Big=96) — both wrong.
// 28px never existed in Figma; ForumPostCard deviation tracked in DESIGNER_REVIEW.md.
//
// xs  = 20px  Figma "Tiny"
// sm  = 24px  Figma "Extra Small"
// md  = 32px  Figma "Small"
// lg  = 40px  Figma "Medium"
// xl  = 56px  Figma "Large"
// 2xl = 64px  Figma "Extra Large"
// 3xl = 96px  Figma "Big"
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

// ─── Shape ────────────────────────────────────────────────────────────────────
// Figma "Avatar" component has exactly two shapes.
// 'circle'  = border-radius: 50%           — Figma "Circle", all sizes identical
// 'rounded' = border-radius scales by size — Figma "Rounded"
//             xs/sm=4px, md=6px, lg=8px, xl/2xl=12px, 3xl=16px
//             See Avatar.module.scss for per-size rules and Figma token mapping.
export type AvatarShape = 'circle' | 'rounded';

// ─── Type ─────────────────────────────────────────────────────────────────────
// Figma's six content types (node 10:1763 symbols).
// Default inference: src present → 'image'; no src → 'letter-of-name'.
// On image load error, 'image' falls back to 'letter-of-name' automatically.
export type AvatarType =
  | 'image'          // actual photo; falls back to letter-of-name on error
  | 'placeholder'    // brand-blue bg + white person silhouette
  | 'letter-of-name' // brand-blue bg + white initials (first + last initial)
  | 'brand-logo'     // org/company icon — provide via `icon` prop
  | 'emoji'          // emoji image — provide via `icon` prop
  | 'flag';          // country flag — provide via `icon` prop

// ─── Props ────────────────────────────────────────────────────────────────────
// NOTE: presence dot (AvatarPresenceStatus / online-status dot) was removed.
// Routing availability status through Avatar is tracked as a future Phase 2.2 commit.

export interface AvatarProps {
  /** Full name — used for initials (first + last initial) and default aria-label */
  name: string;
  /** Photo URL. When provided, type defaults to 'image'. Falls back to 'letter-of-name' on error. */
  src?: string;
  /**
   * Content type. If omitted: 'image' when src is present, 'letter-of-name' otherwise.
   * For 'brand-logo' | 'emoji' | 'flag', pass content via the `icon` prop.
   */
  type?: AvatarType;
  /** Custom content for brand-logo, emoji, flag types */
  icon?: React.ReactNode;
  size?: AvatarSize;
  shape?: AvatarShape;
  /**
   * Top-right badge slot — for Verified, Logo, Notification indicators.
   * Positioned at top: -4px; right: -4px (matches Figma AvatarStatusTop).
   */
  topBadge?: React.ReactNode;
  /**
   * Bottom-center badge slot — for card-level badges.
   * Positioned at top: 100%; left: 50%; transform: translateX(-50%).
   */
  bottomBadge?: React.ReactNode;
  /**
   * Renders the two decorative concentric rings (inner 106px + outer 150px).
   * Only meaningful at size='3xl' (96px). Rings are inline SVGs from Figma export.
   */
  decorativeRing?: boolean;
  className?: string;
  'aria-label'?: string;
}

export interface AvatarStackProps {
  children: React.ReactNode;
  /**
   * Overlap between adjacent avatars.
   * 'auto' (default) = round(sizePx × 0.3).
   * Numeric value overrides in px — use negative values to add spacing instead.
   */
  gap?: number | 'auto';
  /** Show only the first N avatars; render overflow pill for the rest */
  maxVisible?: number;
  /** Explicit overflow count — auto-computed from children.length when omitted */
  overflow?: number;
  /** Should match the size prop of the child Avatar components */
  size?: AvatarSize;
  /** Should match the shape prop of the child Avatar components */
  shape?: AvatarShape;
  className?: string;
}

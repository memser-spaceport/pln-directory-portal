'use client';

import React, { useState } from 'react';
import { User } from '@phosphor-icons/react';
import styles from './Avatar.module.scss';
import type {
  AvatarProps,
  AvatarStackProps,
  AvatarSize,
  AvatarShape,
  AvatarType,
} from './Avatar.types';

// ─── Size lookup ──────────────────────────────────────────────────────────────
// Figma-canonical pixel values from node 10:1763.

const SIZE_PX: Record<AvatarSize, number> = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 56,
  '2xl': 64,
  '3xl': 96,
};

// ─── Initials ─────────────────────────────────────────────────────────────────
// Figma canonical (node 10:1763, all 14 size×shape combinations):
//   xs/sm/md (Tiny/Extra Small/Small — 20/24/32px) → single initial (first word only)
//   lg/xl/2xl/3xl (Medium+ — 40px+)               → two initials (first + last)
// At single-word names, single initial is always used regardless of size.

const SINGLE_INITIAL_SIZES: AvatarSize[] = ['xs', 'sm', 'md'];

function getInitials(name: string, size: AvatarSize): string {
  const parts = name.trim().split(/\s+/);
  if (SINGLE_INITIAL_SIZES.includes(size) || parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ─── Type resolution ──────────────────────────────────────────────────────────

function resolveType(type: AvatarType | undefined, src: string | undefined): AvatarType {
  if (type) return type;
  return src ? 'image' : 'letter-of-name';
}

// ─── Decorative ring SVGs ─────────────────────────────────────────────────────
// Source: Figma "Member Card Desktop" (36:21630) — inner (36:21634) + outer (36:21636).
// Designed for 80px avatar; at 3xl=96px they scale proportionally via CSS width/height.
// Inner: 106px ring, stroke color = --border-neutral-subtle @ 40% path opacity.
// Outer: ~150px ring, #D8DEEC stroke @ 40% + 4 decorative accent dots.
//
// TODO: Replace inline path data with production-hosted SVG assets when available
// in the Figma design handoff. Component API (decorativeRing prop) will not change.

function RingInner() {
  return (
    <svg
      aria-hidden="true"
      className={styles.ringInner}
      viewBox="0 0 106 106"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      overflow="visible"
    >
      <g clipPath="url(#ring-inner-clip)">
        <path
          opacity="0.4"
          d="M53 105C81.7188 105 105 81.7188 105 53C105 24.2812 81.7188 1 53 1C24.2812 1 1 24.2812 1 53C1 81.7188 24.2812 105 53 105Z"
          stroke="var(--border-neutral-subtle)"
        />
      </g>
      <defs>
        <clipPath id="ring-inner-clip">
          <rect width="106" height="106" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function RingOuter() {
  return (
    <svg
      aria-hidden="true"
      className={styles.ringOuter}
      viewBox="0 0 149.98 150.106"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      overflow="visible"
    >
      <path
        opacity="0.4"
        d="M74.9898 149.606C116.129 149.606 149.48 116.228 149.48 75.0532C149.48 33.8786 116.129 0.5 74.9898 0.5C33.8502 0.5 0.5 33.8786 0.5 75.0532C0.5 116.228 33.8502 149.606 74.9898 149.606Z"
        stroke="#D8DEEC"
      />
      <circle opacity="0.4" cx="139.276" cy="37.266" r="2.551" fill="#D8DEEC" />
      <circle opacity="0.4" cx="9.684" cy="39.309" r="2.551" fill="#D8DEEC" />
      <circle opacity="0.4" cx="3.561" cy="97.521" r="2.551" fill="#D8DEEC" />
      <circle opacity="0.4" cx="145.398" cy="97.521" r="2.551" fill="#D8DEEC" />
    </svg>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({
  name,
  src,
  type,
  icon,
  size = 'md',
  shape = 'circle',
  topBadge,
  bottomBadge,
  decorativeRing = false,
  className,
  'aria-label': ariaLabel,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  const resolved = resolveType(type, src);
  // Image falls back to letter-of-name on load error
  const effectiveType: AvatarType =
    resolved === 'image' && imgError ? 'letter-of-name' : resolved;

  const showRings = decorativeRing && size === '3xl';

  const rootClasses = [
    styles.root,
    styles[`size-${size}`],
    styles[`shape-${shape}`],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClasses} role="img" aria-label={ariaLabel ?? name}>
      {showRings && (
        <>
          <RingOuter />
          <RingInner />
        </>
      )}

      {/* ── Surface (clip container) ── */}
      <div className={styles.surface}>
        {effectiveType === 'image' && src && (
          <img
            src={src}
            alt=""
            className={styles.photo}
            onError={() => setImgError(true)}
            aria-hidden="true"
          />
        )}

        {effectiveType === 'letter-of-name' && (
          <span className={styles.initials} aria-hidden="true">
            {getInitials(name, size)}
          </span>
        )}

        {effectiveType === 'placeholder' && (
          <User weight="fill" className={styles.placeholderIcon} aria-hidden="true" />
        )}

        {(effectiveType === 'brand-logo' ||
          effectiveType === 'emoji' ||
          effectiveType === 'flag') &&
          icon && (
            <span className={styles.iconContent} aria-hidden="true">
              {icon}
            </span>
          )}
      </div>

      {/* ── Top-right badge slot (Verified, Logo, Notification…) ── */}
      {topBadge && <div className={styles.topBadgeSlot}>{topBadge}</div>}

      {/* ── Bottom-center badge slot (MemberCard OH pill, etc.) ── */}
      {bottomBadge && <div className={styles.bottomBadgeSlot}>{bottomBadge}</div>}
    </div>
  );
}

// ─── AvatarStack ─────────────────────────────────────────────────────────────

export function AvatarStack({
  children,
  gap = 'auto',
  maxVisible,
  overflow,
  size = 'md',
  shape = 'circle',
  className,
}: AvatarStackProps) {
  const allItems = React.Children.toArray(children);
  const visibleItems = maxVisible != null ? allItems.slice(0, maxVisible) : allItems;
  const hiddenCount =
    overflow != null
      ? overflow
      : maxVisible != null && allItems.length > maxVisible
        ? allItems.length - maxVisible
        : 0;

  const sizePx = SIZE_PX[size];
  const overlapPx = gap === 'auto' ? Math.round(sizePx * 0.3) : gap;

  return (
    <div className={`${styles.stack} ${className ?? ''}`}>
      {visibleItems.map((child, i) => (
        <div
          key={i}
          className={styles.stackItem}
          style={i > 0 ? { marginLeft: -overlapPx } : undefined}
        >
          {child}
        </div>
      ))}
      {hiddenCount > 0 && (
        <div
          className={`${styles.stackOverflow} ${styles[`size-${size}`]} ${styles[`shape-${shape}`]}`}
          style={{ marginLeft: -overlapPx }}
          aria-label={`${hiddenCount} more`}
        >
          <span>+{hiddenCount}</span>
        </div>
      )}
    </div>
  );
}

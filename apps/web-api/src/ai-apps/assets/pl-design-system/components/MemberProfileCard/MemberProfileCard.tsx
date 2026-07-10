import clsx from 'clsx';
import type { MemberProfileCardProps } from './MemberProfileCard.types';
import styles from './MemberProfileCard.module.scss';
import { Avatar } from '@components/Avatar';
import { Badge } from '@components/Badge';

const availabilityLabel: Record<string, string> = {
  available:   'Available to connect',
  booked:      'Frequently Booked',
  unavailable: 'Not available',
};

const MapPinIcon = () => (
  <svg className={styles.locationIcon} viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 1a4.5 4.5 0 0 1 4.5 4.5c0 3-4.5 7.5-4.5 7.5S2.5 8.5 2.5 5.5A4.5 4.5 0 0 1 7 1Z"
      stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="7" cy="5.5" r="1.5" fill="currentColor"/>
  </svg>
);

// Card-level decoration — NOT part of the Avatar primitive.
// Rings are centred at SVG point (75, 73.5), which maps to the avatar
// centre (banner bottom edge) once positioned in the banner.
// Outer: ~150×147 px · Inner: ~106×106 px (Figma approx — adjust if verified).
const DecorativeRings = () => (
  <svg
    className={styles.rings}
    width="150" height="147"
    viewBox="0 0 150 147"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse cx="75" cy="73.5" rx="74" ry="72.5"
      stroke="var(--transparent-brand-6)" strokeWidth="1" />
    <circle  cx="75" cy="73.5" r="52"
      stroke="var(--transparent-brand-8)" strokeWidth="1.5" />
  </svg>
);

export function MemberProfileCard({
  name, role, company, location, tags = [],
  avatar, availability, href, className, ...props
}: MemberProfileCardProps) {
  const Tag = href ? 'a' : 'div';

  return (
    <Tag
      href={href}
      className={clsx(styles.root, className)}
      {...props as any}
    >
      {/* ── Banner: gradient + rings + avatar ───────────────────────────── */}
      <div className={styles.banner}>
        <DecorativeRings />
        <div className={styles.avatarWrap}>
          <Avatar name={name} src={avatar} size="3xl" shape="circle" aria-label="" />
          {availability && (
            <span className={clsx(styles.pill, styles[availability])}>
              <span className={styles.pillDot} />
              {availabilityLabel[availability]}
            </span>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className={styles.content}>
        <div className={styles.name}>{name}</div>

        {(role || company) && (
          <div className={styles.meta}>
            {role    && <span className={styles.role}>{role}</span>}
            {role && company && <span className={styles.metaDot} aria-hidden="true">·</span>}
            {company && <span className={styles.company}>{company}</span>}
          </div>
        )}

        {location && (
          <div className={styles.location}>
            <MapPinIcon />
            {location}
          </div>
        )}

        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map(tag => (
              <Badge key={tag} color="gray" styleType="light" size="sm">{tag}</Badge>
            ))}
          </div>
        )}
      </div>
    </Tag>
  );
}

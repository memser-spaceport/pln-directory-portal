import clsx from 'clsx';
import type { MemberCardProps } from './MemberCard.types';
import styles from './MemberCard.module.scss';

const availabilityLabel: Record<string, string> = {
  available: 'Available to connect',
  booked: 'Frequently Booked',
  unavailable: 'Not available',
};

const LocationIcon = () => (
  <svg className={styles.locationIcon} viewBox="0 0 14 14" fill="none">
    <path d="M7 1a4.5 4.5 0 0 1 4.5 4.5c0 3-4.5 7.5-4.5 7.5S2.5 8.5 2.5 5.5A4.5 4.5 0 0 1 7 1Z" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="7" cy="5.5" r="1.5" fill="currentColor"/>
  </svg>
);

export function MemberCard({ avatar, name, role, company, location, availability, tags, href, compact = false, className, ...props }: MemberCardProps) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const Tag = href ? 'a' : 'div';

  return (
    <Tag href={href} className={clsx(styles.root, compact && styles.compact, className)} {...props as any}>
      <div className={styles.avatarWrapper}>
        {avatar ? (
          <img src={avatar} alt={name} className={styles.avatar} />
        ) : (
          <div className={styles.avatarFallback}>{initials}</div>
        )}
        {availability && (
          <span className={clsx(styles.availability, styles[availability])}>
            <span className={styles.availabilityDot} />
            {availabilityLabel[availability]}
          </span>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.name}>{name}</div>
        {company && <div className={styles.company}>{company}</div>}
        {role && <div className={styles.role}>{role}</div>}
        {location && (
          <div className={styles.location}>
            <LocationIcon />
            {location}
          </div>
        )}
        {tags && tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map(tag => <span key={tag} className={styles.tag}>{tag}</span>)}
          </div>
        )}
      </div>
    </Tag>
  );
}

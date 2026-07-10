import clsx from 'clsx';
import type { TeamCardProps } from './TeamCard.types';
import styles from './TeamCard.module.scss';
import { Avatar } from '@components/Avatar';

const ExternalIcon = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.externalIcon}><path d="M6 3H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M8.5 2H12v3.5M12 2l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;

const MAX_MEMBERS = 4;

export function TeamCard({ logo, logoFallback, name, description, website, tags = [], members = [], actions, href, stage, compact = false, className, ...props }: TeamCardProps) {
  const Tag = href ? 'a' : 'div';
  const fallbackText = logoFallback ?? name.slice(0, 2).toUpperCase();
  const visibleMembers = members.slice(0, MAX_MEMBERS);
  const overflow = members.length - MAX_MEMBERS;

  return (
    <Tag href={href} className={clsx(styles.root, compact && styles.compact, className)} {...props as any}>
      <div className={styles.header}>
        {logo ? (
          <img src={logo} alt={name} className={styles.logo} />
        ) : (
          <div className={styles.logoFallback}>{fallbackText}</div>
        )}
        <div className={styles.headerContent}>
          <div className={styles.nameRow}>
            <span className={styles.name}>{name}</span>
            {href && <ExternalIcon />}
          </div>
          {website && (
            <a href={website} className={styles.website} onClick={e => e.stopPropagation()}>
              🌐 {website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {tags.length > 0 && (
            <div className={styles.tags}>
              {stage && <span className={clsx(styles.tag, styles.stage)}>Stage: {stage}</span>}
              {tags.map(tag => <span key={tag} className={styles.tag}>{tag}</span>)}
            </div>
          )}
        </div>
      </div>

      {description && <p className={styles.description}>{description}</p>}

      {visibleMembers.length > 0 && (
        <div className={styles.members}>
          {visibleMembers.map((m) => (
            <div key={m.name} className={styles.memberItem}>
              <Avatar name={m.name} src={m.avatar} size="md" aria-label="" />
              <div>
                <div className={styles.memberName}>{m.name}</div>
                {m.role && <div className={styles.memberRole}>{m.role}</div>}
              </div>
            </div>
          ))}
          {overflow > 0 && <div className={styles.overflowMember}>+{overflow}</div>}
        </div>
      )}

      {actions && <div className={styles.actions}>{actions}</div>}
    </Tag>
  );
}

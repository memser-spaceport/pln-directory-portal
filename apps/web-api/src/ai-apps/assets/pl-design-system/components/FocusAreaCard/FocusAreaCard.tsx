import clsx from 'clsx';
import type { FocusAreaCardProps } from './FocusAreaCard.types';
import styles from './FocusAreaCard.module.scss';
import { Avatar, AvatarStack } from '@components/Avatar';

const MAX_AVATARS = 4;

export function FocusAreaCard({ title, description, teamCount, projectCount, members = [], href, className, ...props }: FocusAreaCardProps) {
  const Tag = href ? 'a' : 'div';

  return (
    <Tag href={href} className={clsx(styles.root, className)} {...props as any}>
      <div className={styles.title}>{title}</div>
      {description && <p className={styles.description}>{description}</p>}

      {(teamCount !== undefined || projectCount !== undefined) && (
        <div className={styles.stats}>
          {teamCount !== undefined && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>{teamCount} Teams</span>
              <div className={styles.statRight}>
                {members.length > 0 && (
                  <AvatarStack size="xs" maxVisible={MAX_AVATARS}>
                    {members.map((m) => (
                      <Avatar key={m.name} name={m.name} src={m.avatar} size="xs" aria-label="" />
                    ))}
                  </AvatarStack>
                )}
                <span className={styles.arrow}>→</span>
              </div>
            </div>
          )}
          {projectCount !== undefined && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>{projectCount} Projects</span>
              <span className={styles.arrow}>→</span>
            </div>
          )}
        </div>
      )}
    </Tag>
  );
}

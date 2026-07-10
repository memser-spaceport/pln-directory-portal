import clsx from 'clsx';
import type { EmptyStateProps } from './EmptyState.types';
import styles from './EmptyState.module.scss';

const DefaultIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="4" y="8" width="24" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 14h24" stroke="currentColor" strokeWidth="1.5" />
    <path d="M11 20h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M11 24h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
  ...props
}: EmptyStateProps) {
  const resolvedIcon = icon !== undefined ? icon : <DefaultIcon />;

  return (
    <div className={clsx(styles.root, className)} {...props}>
      <div className={styles.iconWrapper}>{resolvedIcon}</div>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {(primaryAction || secondaryAction) && (
        <div className={styles.actions}>
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

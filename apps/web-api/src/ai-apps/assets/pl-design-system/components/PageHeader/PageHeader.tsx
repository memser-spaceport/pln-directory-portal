import clsx from 'clsx';
import type { PageHeaderProps } from './PageHeader.types';
import styles from './PageHeader.module.scss';

export function PageHeader({ title, subtitle, description, actions, breadcrumbs, pattern = true, compact = false, className, ...props }: PageHeaderProps) {
  return (
    <div className={clsx(styles.root, compact && styles.compact, className)} {...props}>
      {pattern && <div className={styles.pattern} aria-hidden="true" />}
      <div className={styles.inner}>
        <div className={styles.content}>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className={styles.breadcrumbItem} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                  {i > 0 && <span className={styles.breadcrumbSep}>/</span>}
                  {crumb.href ? <a href={crumb.href} className={styles.breadcrumbItem}>{crumb.label}</a> : <span>{crumb.label}</span>}
                </span>
              ))}
            </nav>
          )}
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}

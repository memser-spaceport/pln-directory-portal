import clsx from 'clsx';
import type { BottomNavProps } from './BottomNav.types';
import styles from './BottomNav.module.scss';

export function BottomNav({ items, className }: BottomNavProps) {
  return (
    <nav className={clsx(styles.root, className)} aria-label="Bottom navigation">
      {items.map((item) => {
        const Tag = item.href ? 'a' : 'button';
        return (
          <Tag
            key={item.id}
            href={item.href}
            className={clsx(styles.item, item.active && styles.active)}
            onClick={item.onClick}
            aria-current={item.active ? 'page' : undefined}
          >
            <span className={styles.icon}>
              {item.active && item.activeIcon ? item.activeIcon : item.icon}
              {item.badge !== undefined && item.badge > 0 && (
                <span className={styles.badge}>{item.badge > 99 ? '99+' : item.badge}</span>
              )}
            </span>
            <span className={styles.label}>{item.label}</span>
          </Tag>
        );
      })}
    </nav>
  );
}

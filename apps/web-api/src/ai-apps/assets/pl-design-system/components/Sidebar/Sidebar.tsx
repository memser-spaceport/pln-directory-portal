'use client';

import clsx from 'clsx';
import type { SidebarProps } from './Sidebar.types';
import styles from './Sidebar.module.scss';

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export function Sidebar({ open, onClose, sections = [], header, footer, side = 'left', className }: SidebarProps) {
  if (!open) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <nav className={clsx(styles.sidebar, styles[side], className)} aria-label="Navigation">
        <div className={styles.header}>
          {header ?? <span style={{ fontSize: '16px', fontWeight: '600' }}>Menu</span>}
          <button className={styles.closeButton} onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.body}>
          {sections.map((section, si) => (
            <div key={si} className={styles.section}>
              {section.title && <div className={styles.sectionTitle}>{section.title}</div>}
              {section.items.map((item) => {
                const Tag = item.href ? 'a' : 'button';
                return (
                  <Tag
                    key={item.id}
                    href={item.href}
                    className={clsx(styles.item, item.active && styles.active)}
                  >
                    {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                    {item.label}
                    {item.badge !== undefined && <span className={styles.itemBadge}>{item.badge}</span>}
                  </Tag>
                );
              })}
            </div>
          ))}
        </div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </nav>
    </>
  );
}

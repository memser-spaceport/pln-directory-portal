'use client';

import clsx from 'clsx';
import type { NavBarProps } from './NavBar.types';
import styles from './NavBar.module.scss';
import { Avatar } from '@components/Avatar';

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2a5 5 0 0 0-5 5v3l-1.5 2h13L14 10V7a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M7.5 15.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <line x1="3" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="3" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export function NavBar({
  logo, logoHref = '/', items = [], notificationCount = 0,
  onNotificationClick, avatar, avatarFallback, userName, onAvatarClick,
  onMenuClick, actions, className,
}: NavBarProps) {
  return (
    <header className={clsx(styles.navbar, className)}>
      <div className={styles.inner}>
        <a href={logoHref} className={styles.logo}>
          {logo ?? (
            <>
              <span className={styles.logoMark}>PL</span>
              <span className={styles.logoText}>Protocol Labs</span>
            </>
          )}
        </a>

        {items.length > 0 && (
          <nav className={styles.nav}>
            {items.map((item) => (
              <a key={item.href} href={item.href} className={clsx(styles.navItem, item.active && styles.active)}>
                {item.label}
                {item.badge !== undefined && <span className={styles.navBadge}>{item.badge}</span>}
              </a>
            ))}
          </nav>
        )}

        <div className={styles.spacer} />

        <div className={styles.actions}>
          {actions}

          <button className={styles.iconButton} onClick={onNotificationClick} aria-label="Notifications">
            <BellIcon />
            {notificationCount > 0 && (
              <span className={styles.notifBadge}>{notificationCount > 99 ? '99+' : notificationCount}</span>
            )}
          </button>

          <button className={styles.avatarBtn} onClick={onAvatarClick} aria-label={userName ?? 'Profile'}>
            <Avatar name={userName ?? 'PL'} src={avatar} size="md" aria-label="" />
          </button>
        </div>

        <button className={styles.menuButton} onClick={onMenuClick} aria-label="Open menu">
          <MenuIcon />
        </button>
      </div>
    </header>
  );
}

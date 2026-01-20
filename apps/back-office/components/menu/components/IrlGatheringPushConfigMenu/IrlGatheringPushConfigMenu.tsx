import React from 'react';
import Link from 'next/link';

import s from './IrlGatheringPushConfigMenu.module.scss';

export const IrlGatheringPushConfigMenu = () => {
  return (
    <Link href="/irl-gathering-push-config" passHref>
      <a className={s.menuItem}>
        <BellIcon />
        <span className={s.menuItemLabel}>IRL Push Config</span>
      </a>
    </Link>
  );
};

const BellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2Z"
      fill="currentColor"
    />
  </svg>
);

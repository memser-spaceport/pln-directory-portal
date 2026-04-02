import Link from 'next/link';
import React from 'react';

import s from './AccessControlMenu.module.scss';

export const AccessControlMenu = () => {
  return (
    <Link href="/access-control" passHref>
      <a className={s.menuItem}>
        <AccessControlIcon />
        <span className={s.menuItemLabel}>Access Control</span>
      </a>
    </Link>
  );
};

const AccessControlIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L4 6V11C4 16 7.5 20.5 12 22C16.5 20.5 20 16 20 11V6L12 2Z"
      fill="#455468"
    />
    <path
      d="M9 12L11 14L15 10"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default AccessControlMenu;

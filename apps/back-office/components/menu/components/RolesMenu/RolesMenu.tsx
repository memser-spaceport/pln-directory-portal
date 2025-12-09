import Link from 'next/link';
import React from 'react';

import s from './RolesMenu.module.scss';

export const RolesMenu = () => {
  return (
    <Link href="/roles" passHref>
      <a className={s.menuItem}>
        <RolesIcon />
        <span className={s.menuItemLabel}>Roles</span>
      </a>
    </Link>
  );
};

const RolesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 2.5C7.51472 2.5 5.5 4.51472 5.5 7C5.5 9.48528 7.51472 11.5 10 11.5C12.4853 11.5 14.5 9.48528 14.5 7C14.5 4.51472 12.4853 2.5 10 2.5Z"
      fill="#455468"
    />
    <path
      d="M4 15.25C4 13.4551 6.68629 12 10 12C13.3137 12 16 13.4551 16 15.25V16C16 16.4142 15.6642 16.75 15.25 16.75H4.75C4.33579 16.75 4 16.4142 4 16V15.25Z"
      fill="#455468"
    />
  </svg>
);

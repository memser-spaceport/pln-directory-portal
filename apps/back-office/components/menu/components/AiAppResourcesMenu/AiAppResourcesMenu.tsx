import React from 'react';
import Link from 'next/link';
import s from '../TeamsMenu/TeamsMenu.module.scss';

export const AiAppResourcesMenu = () => {
  return (
    <Link href="/ai-app-resources" passHref>
      <a className={s.menuItem}>
        <ChipIcon />
        <span className={s.menuItemLabel}>AI Apps Resources</span>
      </a>
    </Link>
  );
};

const ChipIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#455468"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
  </svg>
);

export default AiAppResourcesMenu;

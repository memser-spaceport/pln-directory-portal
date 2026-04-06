import React from 'react';
import Link from 'next/link';
import s from '../TeamsMenu/TeamsMenu.module.scss';

export const FounderGuidesMenu = () => {
  return (
    <Link href="/founder-guides" passHref>
      <a className={s.menuItem}>
        <BookIcon />
        <span className={s.menuItemLabel}>Guides</span>
      </a>
    </Link>
  );
};

const BookIcon = () => (
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
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

export default FounderGuidesMenu;

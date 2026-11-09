import React from 'react';
import Link from 'next/link';
import s from '../TeamsMenu/TeamsMenu.module.scss';

export const LabosDigestMenu = () => {
  return (
    <Link href="/labos-digest" className={s.menuItem}>
      <span className={s.menuItemLabel}>LabOS Digest</span>
    </Link>
  );
};

import Link from 'next/link';
import React, { useRef, useState } from 'react';
import { clsx } from 'clsx';

import { useOnClickOutside } from '../../../../hooks/useOnClickOutside';

import s from './IrlGatheringMenu.module.scss';

export const IrlGatheringMenu = () => {
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);

  useOnClickOutside([menuRef], () => setOpen(false));

  return (
    <div className={s.root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className={s.trigger}>
        <IrlIcon />
        <span>IRL Gathering</span>
        <span
          className={clsx(s.chevron, {
            [s.open]: open,
          })}
        >
          <ChevronDownIcon />
        </span>
      </button>

      <div ref={menuRef} className={`${s.menu} ${open ? s.open : ''}`}>
        <Link href="/irl-gathering-push-config" passHref>
          <a className={s.menuItem}>
            <BellIcon />
            <span className={s.menuItemLabel}>Push Config</span>
            <CaretIcon />
          </a>
        </Link>

        <Link href="/irl-gathering-push-send" passHref>
          <a className={s.menuItem}>
            <SendIcon />
            <span className={s.menuItemLabel}>Send Push</span>
            <CaretIcon />
          </a>
        </Link>
      </div>
    </div>
  );
};

const IrlIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
      fill="#455468"
    />
  </svg>
);

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2Z"
      fill="#455468"
    />
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 21 23 12 2 3v7l15 2-15 2v7Z" fill="#455468" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M16.9137 8.1633L10.6637 14.4133C10.5766 14.5007 10.4731 14.57 10.3592 14.6174C10.2452 14.6647 10.1231 14.689 9.99967 14.689C9.87628 14.689 9.75411 14.6647 9.64016 14.6174C9.5262 14.57 9.42271 14.5007 9.33561 14.4133L3.08561 8.1633C2.90949 7.98718 2.81055 7.74831 2.81055 7.49923C2.81055 7.25016 2.90949 7.01129 3.08561 6.83517C3.26173 6.65905 3.5006 6.56011 3.74967 6.56011C3.99874 6.56011 4.23762 6.65905 4.41374 6.83517L10.0005 12.4219L15.5872 6.83439C15.7633 6.65827 16.0022 6.55933 16.2512 6.55933C16.5003 6.55933 16.7392 6.65827 16.9153 6.83439C17.0914 7.01051 17.1904 7.24938 17.1904 7.49845C17.1904 7.74752 17.0914 7.9864 16.9153 8.16252L16.9137 8.1633Z"
      fill="#3D4A5C"
    />
  </svg>
);

const CaretIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={s.caret}>
    <path
      d="M11.5306 8.5306L6.5306 13.5306C6.3897 13.6715 6.19861 13.7506 5.99935 13.7506C5.80009 13.7506 5.60899 13.6715 5.4681 13.5306C5.3272 13.3897 5.24805 13.1986 5.24805 12.9993C5.24805 12.8001 5.3272 12.609 5.4681 12.4681L9.93747 7.99997L5.46935 3.5306C5.39958 3.46083 5.34424 3.37801 5.30649 3.28686C5.26873 3.19571 5.2493 3.09801 5.2493 2.99935C5.2493 2.90069 5.26873 2.80299 5.30649 2.71184C5.34424 2.62069 5.39958 2.53786 5.46935 2.4681C5.53911 2.39833 5.62194 2.34299 5.71309 2.30524C5.80424 2.26748 5.90194 2.24805 6.0006 2.24805C6.09926 2.24805 6.19696 2.26748 6.28811 2.30524C6.37926 2.34299 6.46208 2.39833 6.53185 2.4681L11.5318 7.4681C11.6017 7.53786 11.6571 7.62072 11.6948 7.71193C11.7326 7.80313 11.7519 7.9009 11.7518 7.99961C11.7517 8.09832 11.7321 8.19604 11.6941 8.28715C11.6562 8.37827 11.6006 8.461 11.5306 8.5306Z"
      fill="#8897AE"
    />
  </svg>
);

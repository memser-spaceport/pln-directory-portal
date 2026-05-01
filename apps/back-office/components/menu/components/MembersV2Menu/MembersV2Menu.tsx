import Link from 'next/link';
import React, { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useCookie } from 'react-use';

import { useOnClickOutside } from '../../../../hooks/useOnClickOutside';
import { useMembersStateCounts } from '../../../../hooks/members/useMembersStateCounts';
import { usePoliciesList } from '../../../../hooks/access-control/usePoliciesList';
import { AddMember } from '../../../../screens/members/components/AddMember/AddMember';
import {
  ApprovedIcon,
  PendingIcon,
  PoliciesIcon,
  RejectedIcon,
  VerifiedIcon,
} from './memberStateTabIcons';
import s from './MembersV2Menu.module.scss';

// ─── Icons ────────────────────────────────────────────────────────────────────

const MembersV2Icon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M18.0408 17.1874C17.9859 17.2825 17.907 17.3614 17.8119 17.4162C17.7169 17.4711 17.6091 17.5 17.4994 17.4999H2.49936C2.3897 17.4998 2.28201 17.4709 2.18708 17.416C2.09216 17.3611 2.01335 17.2821 1.95857 17.1872C1.90379 17.0922 1.87497 16.9844 1.875 16.8748C1.87503 16.7651 1.90391 16.6574 1.95873 16.5624C3.14858 14.5054 4.98217 13.0304 7.12202 12.3312C6.06355 11.7011 5.24119 10.7409 4.78122 9.59821C4.32126 8.45548 4.24911 7.19337 4.57588 6.00568C4.90264 4.81798 5.61023 3.77039 6.59 3.02378C7.56977 2.27716 8.76754 1.8728 9.99936 1.8728C11.2312 1.8728 12.4289 2.27716 13.4087 3.02378C14.3885 3.77039 15.0961 4.81798 15.4228 6.00568C15.7496 7.19337 15.6775 8.45548 15.2175 9.59821C14.7575 10.7409 13.9352 11.7011 12.8767 12.3312C15.0165 13.0304 16.8501 14.5054 18.04 16.5624C18.095 16.6574 18.124 16.7651 18.1241 16.8748C18.1242 16.9845 18.0955 17.0923 18.0408 17.1874Z"
      fill="#3D4A5C"
    />
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

const TABS = [
  { id: 'PENDING', label: 'Pending', Icon: PendingIcon },
  { id: 'VERIFIED', label: 'Verified', Icon: VerifiedIcon },
  { id: 'APPROVED', label: 'Approved', Icon: ApprovedIcon },
  { id: 'REJECTED', label: 'Rejected', Icon: RejectedIcon },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export const MembersV2Menu = () => {
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [cookieValue] = useCookie('plnadmin');

  const counts = useMembersStateCounts({ authToken: cookieValue });
  const { data: policiesData } = usePoliciesList({ authToken: cookieValue ?? undefined });

  useOnClickOutside([menuRef], () => setOpen(false));

  return (
    <div className={s.root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className={s.trigger}>
        <MembersV2Icon /> Members{' '}
        <span className={clsx(s.chevron, { [s.open]: open })}>
          <ChevronDownIcon />
        </span>
      </button>
      <div ref={menuRef} className={`${s.menu} ${open ? s.open : ''}`}>
        {TABS.map((tab) => {
          const TabIcon = tab.Icon;
          return (
            <Link key={tab.id} href={`/members-v2?tab=${tab.id}`} passHref>
              <a className={s.menuItem} onClick={() => setOpen(false)}>
                <TabIcon />
                <span className={s.menuItemLabel}>{tab.label}</span>
                <span className={s.menuItemCount}>{counts[tab.id]}</span>
                <CaretIcon />
              </a>
            </Link>
          );
        })}
        <Link href="/members-v2?tab=POLICIES" passHref>
          <a className={s.menuItem} onClick={() => setOpen(false)}>
            <PoliciesIcon />
            <span className={s.menuItemLabel}>Policies</span>
            <span className={s.menuItemCount}>{policiesData?.length ?? 0}</span>
            <CaretIcon />
          </a>
        </Link>
        <AddMember authToken={cookieValue} className={s.addMemberBtn} showRbacSection />
      </div>
    </div>
  );
};

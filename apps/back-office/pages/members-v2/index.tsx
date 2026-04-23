import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { PaginationState, SortingState } from '@tanstack/react-table';
import { useCookie } from 'react-use';
import clsx from 'clsx';

import { ApprovalLayout } from '../../layout/approval-layout';
import { AddMember } from '../../screens/members/components/AddMember/AddMember';
import { MembersTableV2 } from '../../screens/members/components/MembersTableV2';
import { useMembersList } from '../../hooks/members/useMembersList';
import { useAuth } from '../../context/auth-context';
import s from './styles.module.scss';

const ALL_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

type MemberStateTab = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';

const TABS: { id: MemberStateTab; label: string }[] = [
  { id: 'PENDING', label: 'Pending Members' },
  { id: 'VERIFIED', label: 'Verified Members' },
  { id: 'APPROVED', label: 'Approved Members' },
  { id: 'REJECTED', label: 'Rejected Members' },
];

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.5 14.5L10.5 10.5M11.5 6.5C11.5 9.26142 9.26142 11.5 6.5 11.5C3.73858 11.5 1.5 9.26142 1.5 6.5C1.5 3.73858 3.73858 1.5 6.5 1.5C9.26142 1.5 11.5 3.73858 11.5 6.5Z"
      stroke="#9CA3AF"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MembersPageV2 = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading: authLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [activeTab, setActiveTab] = useState<MemberStateTab>('PENDING');
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  useEffect(() => {
    if (!authLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [authLoading, user, isDirectoryAdmin, router]);

  const { data, isLoading, isError } = useMembersList({
    authToken: authToken ?? undefined,
    accessLevel: ALL_LEVELS,
  });

  const members = data?.data ?? [];

  const tabCounts = useMemo<Record<MemberStateTab, number>>(() => {
    const base: Record<MemberStateTab, number> = { PENDING: 0, VERIFIED: 0, APPROVED: 0, REJECTED: 0 };
    for (const m of members) {
      if (m.memberState && m.memberState in base) {
        base[m.memberState as MemberStateTab]++;
      }
    }
    return base;
  }, [members]);

  const filteredMembers = useMemo(() => members.filter((m) => m.memberState === activeTab), [members, activeTab]);

  const handleTabChange = (id: MemberStateTab) => {
    setActiveTab(id);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGlobalFilter(e.target.value);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <header className={s.header}>
          <h1 className={s.title}>Members</h1>
          <p className={s.subtitle}>Manage members and roles for LabOS.</p>
        </header>

        {/* Underline tab bar */}
        <nav className={s.tabBar}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={clsx(s.tab, { [s.tabActive]: activeTab === tab.id })}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
              <span className={clsx(s.tabCount, { [s.tabCountActive]: activeTab === tab.id })}>
                {tabCounts[tab.id]}
              </span>
            </button>
          ))}
        </nav>

        {/* Search + Add Member row */}
        <div className={s.toolbar}>
          <div className={s.searchWrapper}>
            <span className={s.searchIcon}>
              <SearchIcon />
            </span>
            <input
              className={s.searchInput}
              placeholder="Search members"
              value={globalFilter}
              onChange={handleSearchChange}
            />
          </div>
          <AddMember authToken={authToken} className={s.addBtn} />
        </div>

        {isLoading && <div className={s.status}>Loading members…</div>}
        {isError && <div className={s.status}>Failed to load members.</div>}

        {!isLoading && !isError && (
          <MembersTableV2
            members={filteredMembers}
            authToken={authToken}
            pagination={pagination}
            setPagination={setPagination}
            globalFilter={globalFilter}
            sorting={sorting}
            setSorting={setSorting}
          />
        )}
      </div>
    </ApprovalLayout>
  );
};

export default MembersPageV2;

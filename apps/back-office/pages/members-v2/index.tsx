import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { PaginationState, SortingState } from '@tanstack/react-table';
import { useCookie } from 'react-use';

import { ApprovalLayout } from '../../layout/approval-layout';
import { TableFilter } from '../../components/filters/TableFilter/TableFilter';
import { AddMember } from '../../screens/members/components/AddMember/AddMember';
import { MembersTableV2 } from '../../screens/members/components/MembersTableV2';
import { useMembersList } from '../../hooks/members/useMembersList';
import { useAuth } from '../../context/auth-context';
import s from './styles.module.scss';

const ALL_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

type MemberStateTab = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';

const TABS: { id: MemberStateTab; label: string; activeColor: string }[] = [
  { id: 'PENDING', label: 'Pending Members', activeColor: '#D97706' },
  { id: 'VERIFIED', label: 'Verified Members', activeColor: '#1B4DFF' },
  { id: 'APPROVED', label: 'Approved Members', activeColor: '#0A9952' },
  { id: 'REJECTED', label: 'Rejected Members', activeColor: '#D21A0E' },
];

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

  const filteredMembers = useMemo(
    () => members.filter((m) => m.memberState === activeTab),
    [members, activeTab]
  );

  const handleTabChange = (id: string) => {
    setActiveTab(id as MemberStateTab);
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

        <TableFilter
          items={TABS.map((t) => ({
            id: t.id,
            label: t.label,
            count: tabCounts[t.id],
            activeColor: t.activeColor,
            icon: null,
          }))}
          active={activeTab}
          onFilterClick={handleTabChange}
        >
          <AddMember authToken={authToken} className={s.addBtn} />
        </TableFilter>

        <div className={s.toolbar}>
          <input
            className={s.searchInput}
            placeholder="Search members"
            value={globalFilter}
            onChange={handleSearchChange}
          />
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

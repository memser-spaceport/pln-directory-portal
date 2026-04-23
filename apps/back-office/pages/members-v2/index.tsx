import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { PaginationState, SortingState } from '@tanstack/react-table';
import { useCookie } from 'react-use';
import clsx from 'clsx';
import Select, { StylesConfig } from 'react-select';

import { ApprovalLayout } from '../../layout/approval-layout';
import { AddMember } from '../../screens/members/components/AddMember/AddMember';
import { MembersTableV2 } from '../../screens/members/components/MembersTableV2';
import { PoliciesTable } from '../../screens/members/components/PoliciesTable/PoliciesTable';
import { useMembersList } from '../../hooks/members/useMembersList';
import { usePoliciesList } from '../../hooks/access-control/usePoliciesList';
import { useAuth } from '../../context/auth-context';
import s from './styles.module.scss';

const ALL_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

type MemberStateTab = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';
type ActiveTab = MemberStateTab | 'POLICIES';

const MEMBER_STATE_TABS: { id: MemberStateTab; label: string }[] = [
  { id: 'PENDING', label: 'Pending Members' },
  { id: 'VERIFIED', label: 'Verified Members' },
  { id: 'APPROVED', label: 'Approved Members' },
];

const REJECTED_TAB: { id: MemberStateTab; label: string } = { id: 'REJECTED', label: 'Rejected Members' };

type SelectOption = { label: string; value: string };

const selectStyles: StylesConfig<SelectOption> = {
  container: (base) => ({ ...base, width: '100%' }),
  control: (base) => ({
    ...base,
    borderRadius: '8px',
    border: '1px solid rgba(203, 213, 225, 0.50)',
    background: '#fff',
    fontSize: '14px',
    minWidth: '140px',
    boxShadow: 'none',
    borderColor: 'rgba(203, 213, 225, 0.50)',
    '&:hover': { borderColor: '#5E718D', boxShadow: '0 0 0 4px rgba(27, 56, 96, 0.12)' },
  }),
  indicatorSeparator: () => ({ display: 'none' }),
  option: (base) => ({
    ...base,
    fontSize: '14px',
    color: '#455468',
    '&:hover': { background: 'rgba(27, 56, 96, 0.12)' },
  }),
  menu: (base) => ({ ...base, zIndex: 3 }),
};

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

  const [activeTab, setActiveTab] = useState<ActiveTab>('PENDING');
  const [globalFilter, setGlobalFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  const [policySearch, setPolicySearch] = useState('');
  const [policyRoleFilter, setPolicyRoleFilter] = useState('');
  const [policyGroupFilter, setPolicyGroupFilter] = useState('');
  const [policyPagination, setPolicyPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  useEffect(() => {
    if (!authLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [authLoading, user, isDirectoryAdmin, router]);

  const { data, isLoading, isError } = useMembersList({
    authToken: authToken ?? undefined,
    accessLevel: ALL_LEVELS,
  });

  const { data: policiesData } = usePoliciesList({ authToken: authToken ?? undefined });

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

  const approvedMembers = useMemo(
    () => members.filter((m) => m.memberState === 'APPROVED'),
    [members]
  );

  const filteredMembers = useMemo(() => {
    if (activeTab === 'POLICIES') return [];
    let list = members.filter((m) => m.memberState === activeTab);
    if (activeTab === 'APPROVED') {
      if (groupFilter) {
        list = list.filter((m) => m.policies?.some((p) => p.name === groupFilter));
      }
      if (roleFilter) {
        list = list.filter((m) => m.roles?.some((r) => r.name === roleFilter));
      }
    }
    return list;
  }, [members, activeTab, groupFilter, roleFilter]);

  const groupOptions = useMemo<SelectOption[]>(() => {
    const names = new Set<string>();
    for (const m of approvedMembers) {
      for (const p of m.policies ?? []) names.add(p.name);
    }
    return [{ label: 'All groups', value: '' }, ...[...names].sort().map((n) => ({ label: n, value: n }))];
  }, [approvedMembers]);

  const roleOptions = useMemo<SelectOption[]>(() => {
    const names = new Set<string>();
    for (const m of approvedMembers) {
      for (const r of m.roles ?? []) names.add(r.name);
    }
    return [{ label: 'All roles', value: '' }, ...[...names].sort().map((n) => ({ label: n, value: n }))];
  }, [approvedMembers]);

  const policyRoleOptions = useMemo<SelectOption[]>(
    () => [
      { label: 'All roles', value: '' },
      ...[...new Set((policiesData ?? []).map((p) => p.role))].sort().map((r) => ({ label: r, value: r })),
    ],
    [policiesData]
  );

  const policyGroupOptions = useMemo<SelectOption[]>(
    () => [
      { label: 'All groups', value: '' },
      ...[...new Set((policiesData ?? []).map((p) => p.group))].sort().map((g) => ({ label: g, value: g })),
    ],
    [policiesData]
  );

  const filteredPolicies = useMemo(
    () =>
      (policiesData ?? [])
        .filter((p) => !policyRoleFilter || p.role === policyRoleFilter)
        .filter((p) => !policyGroupFilter || p.group === policyGroupFilter)
        .filter((p) => {
          if (!policySearch) return true;
          const q = policySearch.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            (p.description ?? '').toLowerCase().includes(q)
          );
        }),
    [policiesData, policyRoleFilter, policyGroupFilter, policySearch]
  );

  const handleTabChange = (id: ActiveTab) => {
    setActiveTab(id);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setGroupFilter('');
    setRoleFilter('');
    setPolicySearch('');
    setPolicyRoleFilter('');
    setPolicyGroupFilter('');
    setPolicyPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGlobalFilter(e.target.value);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const handlePolicySearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPolicySearch(e.target.value);
    setPolicyPagination((p) => ({ ...p, pageIndex: 0 }));
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
          {MEMBER_STATE_TABS.map((tab) => (
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

          {/* Policies tab — between Approved and Rejected */}
          <button
            className={clsx(s.tab, { [s.tabActive]: activeTab === 'POLICIES' })}
            onClick={() => handleTabChange('POLICIES')}
          >
            Policies
            <span className={clsx(s.tabCount, { [s.tabCountActive]: activeTab === 'POLICIES' })}>
              {policiesData?.length ?? 0}
            </span>
          </button>

          <button
            className={clsx(s.tab, { [s.tabActive]: activeTab === REJECTED_TAB.id })}
            onClick={() => handleTabChange(REJECTED_TAB.id)}
          >
            {REJECTED_TAB.label}
            <span className={clsx(s.tabCount, { [s.tabCountActive]: activeTab === REJECTED_TAB.id })}>
              {tabCounts[REJECTED_TAB.id]}
            </span>
          </button>
        </nav>

        {/* Search + filters + Add Member row */}
        <div className={s.toolbar}>
          {activeTab !== 'POLICIES' && (
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
          )}

          {activeTab === 'POLICIES' && (
            <div className={s.searchWrapper}>
              <span className={s.searchIcon}>
                <SearchIcon />
              </span>
              <input
                className={s.searchInput}
                placeholder="Search policies"
                value={policySearch}
                onChange={handlePolicySearchChange}
              />
            </div>
          )}

          {activeTab === 'APPROVED' && (
            <>
              <div className={s.filterDropdown}>
                <Select<SelectOption>
                  menuPortalTarget={document.body}
                  options={groupOptions}
                  value={groupOptions.find((o) => o.value === groupFilter) ?? groupOptions[0]}
                  onChange={(val) => {
                    setGroupFilter(val?.value ?? '');
                    setPagination((p) => ({ ...p, pageIndex: 0 }));
                  }}
                  isClearable={false}
                  styles={selectStyles}
                />
              </div>
              <div className={s.filterDropdown}>
                <Select<SelectOption>
                  menuPortalTarget={document.body}
                  options={roleOptions}
                  value={roleOptions.find((o) => o.value === roleFilter) ?? roleOptions[0]}
                  onChange={(val) => {
                    setRoleFilter(val?.value ?? '');
                    setPagination((p) => ({ ...p, pageIndex: 0 }));
                  }}
                  isClearable={false}
                  styles={selectStyles}
                />
              </div>
            </>
          )}

          {activeTab === 'POLICIES' && (
            <>
              <div className={s.filterDropdown}>
                <Select<SelectOption>
                  menuPortalTarget={document.body}
                  options={policyRoleOptions}
                  value={policyRoleOptions.find((o) => o.value === policyRoleFilter) ?? policyRoleOptions[0]}
                  onChange={(val) => {
                    setPolicyRoleFilter(val?.value ?? '');
                    setPolicyPagination((p) => ({ ...p, pageIndex: 0 }));
                  }}
                  isClearable={false}
                  styles={selectStyles}
                />
              </div>
              <div className={s.filterDropdown}>
                <Select<SelectOption>
                  menuPortalTarget={document.body}
                  options={policyGroupOptions}
                  value={policyGroupOptions.find((o) => o.value === policyGroupFilter) ?? policyGroupOptions[0]}
                  onChange={(val) => {
                    setPolicyGroupFilter(val?.value ?? '');
                    setPolicyPagination((p) => ({ ...p, pageIndex: 0 }));
                  }}
                  isClearable={false}
                  styles={selectStyles}
                />
              </div>
            </>
          )}

          <AddMember authToken={authToken} className={s.addBtn} />
        </div>

        {activeTab !== 'POLICIES' && (
          <>
            {isLoading && <div className={s.status}>Loading members…</div>}
            {isError && <div className={s.status}>Failed to load members.</div>}
            {!isLoading && !isError && (
              <MembersTableV2
                members={filteredMembers}
                authToken={authToken}
                activeTab={activeTab}
                pagination={pagination}
                setPagination={setPagination}
                globalFilter={globalFilter}
                sorting={sorting}
                setSorting={setSorting}
              />
            )}
          </>
        )}

        {activeTab === 'POLICIES' && (
          <PoliciesTable
            policies={filteredPolicies}
            members={members}
            pagination={policyPagination}
            setPagination={setPolicyPagination}
            globalFilter={policySearch}
          />
        )}
      </div>
    </ApprovalLayout>
  );
};

export default MembersPageV2;

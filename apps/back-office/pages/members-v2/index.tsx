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
import { useMembersStateCounts } from '../../hooks/members/useMembersStateCounts';
import { usePoliciesList } from '../../hooks/access-control/usePoliciesList';
import { useAuth } from '../../context/auth-context';
import { MEMBERS_V2_STATE_TAB_ICONS, PoliciesIcon } from '../../components/menu/components/MembersV2Menu/memberStateTabIcons';
import { ALL_MEMBER_STATES, MEMBER_STATE_TABS, REJECTED_TAB } from './constants';
import type { MemberStateTab, ActiveTab } from './types';
import s from './styles.module.scss';

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
  const { isDirectoryAdmin, isLoading: authLoading, user, hasPermission } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const initialTab = (
    ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED', 'POLICIES'].includes(router.query.tab as string)
      ? router.query.tab
      : 'PENDING'
  ) as ActiveTab;
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);

  useEffect(() => {
    const tab = router.query.tab as string | undefined;
    if (tab && ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED', 'POLICIES'].includes(tab)) {
      setActiveTab(tab as ActiveTab);
    }
  }, [router.query.tab]);

  const [globalFilter, setGlobalFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  const [policySearch, setPolicySearch] = useState('');
  const [policyRoleFilter, setPolicyRoleFilter] = useState('');
  const [policyGroupFilter, setPolicyGroupFilter] = useState('');
  const [policyPagination, setPolicyPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(globalFilter), 300);
    return () => clearTimeout(t);
  }, [globalFilter]);

  // Reset pagination when server-side filters change
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [debouncedSearch, groupFilter, roleFilter]);

  useEffect(() => {
    if (!authLoading && user && !isDirectoryAdmin && !hasPermission('member.contacts.read')) {
      router.replace('/access-denied');
    }
  }, [authLoading, user, isDirectoryAdmin, hasPermission, router]);

  // Per-tab paginated fetch (disabled on POLICIES tab)
  const { data, isLoading, isError } = useMembersList({
    authToken: authToken ?? undefined,
    memberState: activeTab !== 'POLICIES' ? [activeTab] : undefined,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: debouncedSearch || undefined,
    policyGroups: activeTab === 'APPROVED' && groupFilter ? [groupFilter] : undefined,
    policyRoles: activeTab === 'APPROVED' && roleFilter ? [roleFilter] : undefined,
    enabled: activeTab !== 'POLICIES',
  });

  // Full fetch for PoliciesTable member context (only when on POLICIES tab)
  const { data: allMembersData } = useMembersList({
    authToken: authToken ?? undefined,
    memberState: [...ALL_MEMBER_STATES],
    enabled: activeTab === 'POLICIES',
  });

  const tabCounts = useMembersStateCounts({ authToken });

  const { data: policiesData } = usePoliciesList({ authToken: authToken ?? undefined });

  const groupOptions = useMemo<SelectOption[]>(() => {
    const names = new Set<string>((policiesData ?? []).map((p) => p.group).filter(Boolean) as string[]);
    return [{ label: 'All groups', value: '' }, ...[...names].sort().map((n) => ({ label: n, value: n }))];
  }, [policiesData]);

  const roleOptions = useMemo<SelectOption[]>(() => {
    const names = new Set<string>((policiesData ?? []).map((p) => p.role).filter(Boolean) as string[]);
    return [{ label: 'All roles', value: '' }, ...[...names].sort().map((n) => ({ label: n, value: n }))];
  }, [policiesData]);

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
          return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
        }),
    [policiesData, policyRoleFilter, policyGroupFilter, policySearch]
  );

  const handleTabChange = (id: ActiveTab) => {
    setActiveTab(id);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setGlobalFilter('');
    setDebouncedSearch('');
    setGroupFilter('');
    setRoleFilter('');
    setPolicySearch('');
    setPolicyRoleFilter('');
    setPolicyGroupFilter('');
    setPolicyPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGlobalFilter(e.target.value);
  };

  const handlePolicySearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPolicySearch(e.target.value);
    setPolicyPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const RejectedTabIcon = MEMBERS_V2_STATE_TAB_ICONS[REJECTED_TAB.id];

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <header className={s.header}>
          <h1 className={s.title}>Members</h1>
          <p className={s.subtitle}>Manage members and roles for LabOS.</p>
        </header>

        {/* Underline tab bar */}
        <nav className={s.tabBar}>
          {MEMBER_STATE_TABS.map((tab) => {
            const TabIcon = MEMBERS_V2_STATE_TAB_ICONS[tab.id];
            return (
              <button
                key={tab.id}
                className={clsx(s.tab, { [s.tabActive]: activeTab === tab.id })}
                onClick={() => handleTabChange(tab.id)}
              >
                <span className={s.tabIcon} aria-hidden>
                  <TabIcon />
                </span>
                {tab.label}
                <span className={clsx(s.tabCount, { [s.tabCountActive]: activeTab === tab.id })}>
                  {tabCounts[tab.id as MemberStateTab]}
                </span>
              </button>
            );
          })}

          <button
            className={clsx(s.tab, { [s.tabActive]: activeTab === REJECTED_TAB.id })}
            onClick={() => handleTabChange(REJECTED_TAB.id)}
          >
            <span className={s.tabIcon} aria-hidden>
              <RejectedTabIcon />
            </span>
            {REJECTED_TAB.label}
            <span className={clsx(s.tabCount, { [s.tabCountActive]: activeTab === REJECTED_TAB.id })}>
              {tabCounts[REJECTED_TAB.id]}
            </span>
          </button>

          <button
            className={clsx(s.tab, { [s.tabActive]: activeTab === 'POLICIES' })}
            onClick={() => handleTabChange('POLICIES')}
          >
            <span className={s.tabIcon} aria-hidden>
              <PoliciesIcon />
            </span>
            Policies
            <span className={clsx(s.tabCount, { [s.tabCountActive]: activeTab === 'POLICIES' })}>
              {policiesData?.length ?? 0}
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

          {activeTab !== 'POLICIES' && (
            <AddMember authToken={authToken} className={s.addBtn} showRbacSection />
          )}
        </div>

        {activeTab !== 'POLICIES' && (
          <>
            {isLoading && <div className={s.status}>Loading members…</div>}
            {isError && <div className={s.status}>Failed to load members.</div>}
            {!isLoading && !isError && (
              <MembersTableV2
                members={data?.data ?? []}
                authToken={authToken}
                activeTab={activeTab}
                pagination={pagination}
                setPagination={setPagination}
                globalFilter={globalFilter}
                sorting={sorting}
                setSorting={setSorting}
                showRbacSection
                allPolicies={policiesData ?? []}
                pageCount={data?.pagination.pages}
              />
            )}
          </>
        )}

        {activeTab === 'POLICIES' && (
          <PoliciesTable
            policies={filteredPolicies}
            members={allMembersData?.data ?? []}
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

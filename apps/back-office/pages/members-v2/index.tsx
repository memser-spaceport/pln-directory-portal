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
import { MembersListQueryParams, useMembersList } from '../../hooks/members/useMembersList';
import { usePoliciesList } from '../../hooks/access-control/usePoliciesList';
import { useAuth } from '../../context/auth-context';
import { MEMBERS_V2_STATE_TAB_ICONS, PoliciesIcon } from '../../components/menu/components/MembersV2Menu/memberStateTabIcons';
import { useMemberStateCounts } from '../../hooks/members/useAccessLevelCounts';
import s from './styles.module.scss';

type MemberStateTab = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';
type ActiveTab = MemberStateTab | 'POLICIES';

const MEMBER_STATE_TABS: { id: MemberStateTab; label: string }[] = [
  { id: 'PENDING', label: 'Pending Members (L0)' },
  { id: 'VERIFIED', label: 'Verified Members (L1)' },
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

const DEBOUNCE_MS = 300;

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
  /** Default: joined (createdAt) desc. Member / Joined headers toggle sort. */
  const [sorting, setSorting] = useState<SortingState>([{ id: 'joined', desc: true }]);

  const [policySearch, setPolicySearch] = useState('');
  const [policyRoleFilter, setPolicyRoleFilter] = useState('');
  const [policyGroupFilter, setPolicyGroupFilter] = useState('');
  const [policyPagination, setPolicyPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(globalFilter.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [globalFilter]);

  useEffect(() => {
    if (!authLoading && user && !isDirectoryAdmin) {
      router.replace('/access-denied');
    }
  }, [authLoading, user, isDirectoryAdmin, router]);

  const { data: countsData } = useMemberStateCounts({ authToken: authToken ?? '' });

  const tabCounts = useMemo<Record<MemberStateTab, number>>(
    () => ({
      PENDING: countsData?.PENDING ?? 0,
      VERIFIED: countsData?.VERIFIED ?? 0,
      APPROVED: countsData?.APPROVED ?? 0,
      REJECTED: countsData?.REJECTED ?? 0,
    }),
    [countsData]
  );

  const apiSort = useMemo(() => {
    const s = sorting[0];
    if (s?.id === 'name') {
      return { sortBy: 'name' as const, sortOrder: s.desc ? ('desc' as const) : ('asc' as const) };
    }
    if (s?.id === 'joined') {
      return { sortBy: 'createdAt' as const, sortOrder: s.desc ? ('desc' as const) : ('asc' as const) };
    }
    return { sortBy: 'createdAt' as const, sortOrder: 'desc' as const };
  }, [sorting]);

  const membersListArgs: MembersListQueryParams = useMemo(
    () => ({
      authToken: authToken ?? undefined,
      memberState: activeTab !== 'POLICIES' ? [activeTab] : ['PENDING'],
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
      search: debouncedSearch || undefined,
      policyGroups: activeTab === 'APPROVED' && groupFilter ? [groupFilter] : undefined,
      policyRoles: activeTab === 'APPROVED' && roleFilter ? [roleFilter] : undefined,
      sortBy: apiSort.sortBy,
      sortOrder: apiSort.sortOrder,
    }),
    [authToken, activeTab, pagination.pageIndex, pagination.pageSize, debouncedSearch, groupFilter, roleFilter, apiSort]
  );

  const { data: listResponse, isLoading, isError } = useMembersList(membersListArgs, {
    enabled: !!authToken && activeTab !== 'POLICIES',
  });

  const members = listResponse?.data ?? [];
  const pageCount = listResponse?.pagination.pages ?? 1;
  const totalMembers = listResponse?.pagination.total ?? 0;

  const { data: policiesData } = usePoliciesList({ authToken: authToken ?? undefined });

  const groupOptions = useMemo<SelectOption[]>(
    () => [
      { label: 'All groups', value: '' },
      ...[...new Set((policiesData ?? []).map((p) => p.group))].sort().map((n) => ({ label: n, value: n })),
    ],
    [policiesData]
  );

  const roleOptions = useMemo<SelectOption[]>(
    () => [
      { label: 'All roles', value: '' },
      ...[...new Set((policiesData ?? []).map((p) => p.role))].sort().map((n) => ({ label: n, value: n })),
    ],
    [policiesData]
  );

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
    setGroupFilter('');
    setRoleFilter('');
    setSorting([{ id: 'joined', desc: true }]);
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

  const RejectedTabIcon = MEMBERS_V2_STATE_TAB_ICONS[REJECTED_TAB.id];

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <header className={s.header}>
          <h1 className={s.title}>Members</h1>
          <p className={s.subtitle}>Manage members and roles for LabOS.</p>
        </header>

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
                  {tabCounts[tab.id]}
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

          {activeTab !== 'POLICIES' && <AddMember authToken={authToken} className={s.addBtn} showRbacSection />}
        </div>

        {activeTab !== 'POLICIES' && (
          <>
            {isLoading && <div className={s.status}>Loading members…</div>}
            {isError && <div className={s.status}>Failed to load members.</div>}
            {!isLoading && !isError && (
              <MembersTableV2
                members={members}
                authToken={authToken ?? ''}
                activeTab={activeTab}
                pagination={pagination}
                setPagination={setPagination}
                sorting={sorting}
                setSorting={setSorting}
                pageCount={pageCount}
                totalRowCount={totalMembers}
                showRbacSection
              />
            )}
          </>
        )}

        {activeTab === 'POLICIES' && (
          <PoliciesTable
            policies={filteredPolicies}
            authToken={authToken ?? undefined}
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

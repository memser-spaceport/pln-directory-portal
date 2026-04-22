import React, { useEffect, useMemo, useState } from 'react';

import s from './styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { flexRender, PaginationState, SortingState } from '@tanstack/react-table';
import { useMembersTable } from '../../screens/members/hooks/useMembersTable';
import { usePoliciesTable } from '../../screens/members/hooks/usePoliciesTable';
import { useMembersList } from '../../hooks/members/useMembersList';
import { usePoliciesList } from '../../hooks/access-control/usePoliciesList';
import { SortIcon } from '../../screens/members/components/icons';
import clsx from 'clsx';
import PaginationControls from '../../screens/members/components/PaginationControls/PaginationControls';
import { AddMember } from '../../screens/members/components/AddMember/AddMember';
import { useCookie } from 'react-use';
import { useAuth } from '../../context/auth-context';

type FilterId = 'level0' | 'level1' | 'level2' | 'level56' | 'rejected';

const ALL_ACCESS_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

const TAB_STATE_MAP: Record<FilterId, string> = {
  level0: 'PENDING',
  level1: 'VERIFIED',
  level2: 'APPROVED',
  level56: '',
  rejected: 'REJECTED',
};

const TAB_LABELS: Record<FilterId, string> = {
  level0: 'Pending Members',
  level1: 'Verified Members',
  level2: 'Approved Members',
  level56: 'Policies',
  rejected: 'Rejected Members',
};

const TAB_IDS: FilterId[] = ['level0', 'level1', 'level2', 'level56', 'rejected'];

const MembersPage = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const query = router.query;
  const { filter, search } = query;
  const [authToken] = useCookie('plnadmin');

  const activeFilter: FilterId = (filter as FilterId | undefined) ?? 'level0';

  const setFilter = (id: FilterId) => {
    router.replace({ query: { filter: id } }, undefined, { shallow: true });
  };

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  useEffect(() => {
    if (!authToken) {
      router.push(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  const { data: membersData } = useMembersList({ authToken, accessLevel: ALL_ACCESS_LEVELS });
  const { data: policiesData, isError: policiesError } = usePoliciesList({ authToken });

  const allMembers = membersData?.data ?? [];

  const tabCounts = useMemo(
    () => ({
      level0: allMembers.filter((m) => m.memberState === 'PENDING').length,
      level1: allMembers.filter((m) => m.memberState === 'VERIFIED').length,
      level2: allMembers.filter((m) => m.memberState === 'APPROVED').length,
      level56: policiesData?.length ?? 0,
      rejected: allMembers.filter((m) => m.memberState === 'REJECTED').length,
    }),
    [allMembers, policiesData]
  );

  // Member table state
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [globalFilter, setGlobalFilter] = useState<string>((search as string | undefined) ?? '');

  // Approved tab filter dropdowns
  const [approvedGroupFilter, setApprovedGroupFilter] = useState('');
  const [approvedRoleFilter, setApprovedRoleFilter] = useState('');

  // Policies tab state
  const [policiesSorting, setPoliciesSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [policiesPagination, setPoliciesPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [policiesSearch, setPoliciesSearch] = useState('');
  const [policiesRoleFilter, setPoliciesRoleFilter] = useState('');
  const [policiesGroupFilter, setPoliciesGroupFilter] = useState('');

  // Reset on tab switch
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setGlobalFilter('');
    setApprovedGroupFilter('');
    setApprovedRoleFilter('');
    setPoliciesPagination((p) => ({ ...p, pageIndex: 0 }));
    setPoliciesSearch('');
    setPoliciesRoleFilter('');
    setPoliciesGroupFilter('');
  }, [activeFilter]);

  useEffect(() => {
    if (search) setGlobalFilter(search as string);
  }, [search]);

  // Filtered members for current tab
  const tabMembers = useMemo(() => {
    const state = TAB_STATE_MAP[activeFilter];
    if (!state) return [];
    return allMembers.filter((m) => m.memberState === state);
  }, [allMembers, activeFilter]);

  // Dropdown options for Approved tab
  const approvedGroups = useMemo(
    () => [...new Set(tabMembers.flatMap((m) => m.memberPolicies?.map((p) => p.group) ?? []))].filter(Boolean).sort(),
    [tabMembers]
  );
  const approvedRoles = useMemo(
    () => [...new Set(tabMembers.flatMap((m) => m.rbacRoles?.map((r) => r.name) ?? []))].filter(Boolean).sort(),
    [tabMembers]
  );

  // Apply Approved tab dropdown filters
  const filteredApprovedMembers = useMemo(() => {
    if (activeFilter !== 'level2') return tabMembers;
    return tabMembers.filter((m) => {
      const matchesGroup = !approvedGroupFilter || m.memberPolicies?.some((p) => p.group === approvedGroupFilter);
      const matchesRole = !approvedRoleFilter || m.rbacRoles?.some((r) => r.name === approvedRoleFilter);
      return matchesGroup && matchesRole;
    });
  }, [tabMembers, approvedGroupFilter, approvedRoleFilter, activeFilter]);

  const { table } = useMembersTable({
    members: activeFilter === 'level2' ? filteredApprovedMembers : tabMembers,
    sorting,
    setSorting,
    authToken,
    pagination,
    setPagination,
    globalFilter,
    setGlobalFilter,
    mode: activeFilter === 'level2' ? 'approved' : 'members',
  });

  // Dropdown options for Policies tab
  const policiesRoles = useMemo(
    () => [...new Set(policiesData?.map((p) => p.role) ?? [])].filter(Boolean).sort(),
    [policiesData]
  );
  const policiesGroups = useMemo(
    () => [...new Set(policiesData?.map((p) => p.group) ?? [])].filter(Boolean).sort(),
    [policiesData]
  );

  // Apply Policies tab filters
  const filteredPolicies = useMemo(() => {
    if (!policiesData) return [];
    return policiesData.filter((p) => {
      const matchesRole = !policiesRoleFilter || p.role === policiesRoleFilter;
      const matchesGroup = !policiesGroupFilter || p.group === policiesGroupFilter;
      return matchesRole && matchesGroup;
    });
  }, [policiesData, policiesRoleFilter, policiesGroupFilter]);

  const { table: policiesTable } = usePoliciesTable({
    policies: filteredPolicies,
    sorting: policiesSorting,
    setSorting: setPoliciesSorting,
    pagination: policiesPagination,
    setPagination: setPoliciesPagination,
    globalFilter: policiesSearch,
    setGlobalFilter: setPoliciesSearch,
  });

  if (!isLoading && user && !isDirectoryAdmin) {
    return null;
  }

  const renderTableBody = (tbl: typeof table | typeof policiesTable, emptyMsg: string) => (
    <>
      <div className={s.table}>
        {tbl.getHeaderGroups().map((headerGroup) => (
          <div key={headerGroup.id} className={s.tableRow}>
            {headerGroup.headers.map((header, i) =>
              header.isPlaceholder ? null : (
                <div
                  key={header.id}
                  className={clsx(s.headerCell, {
                    [s.first]: i === 0,
                    [s.fixed]: !!header.column.columnDef.size,
                    [s.flexible]: !header.column.columnDef.size,
                    [s.sortable]: header.column.getCanSort(),
                    [s.actionsCol]: header.column.id === 'actions' || header.column.id === 'action',
                  })}
                  style={{ width: header.column.getSize(), flexBasis: header.column.getSize() }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getCanSort() && <SortIcon />}
                </div>
              )
            )}
          </div>
        ))}

        {tbl.getRowModel().rows.length === 0 ? (
          <div className={s.emptyState}>{emptyMsg}</div>
        ) : (
          tbl.getRowModel().rows.map((row) => (
            <div key={row.id} className={s.tableRow}>
              {row.getVisibleCells().map((cell, i) => (
                <div
                  key={cell.id}
                  className={clsx(s.bodyCell, {
                    [s.first]: i === 0,
                    [s.fixed]: !!cell.column.columnDef.size,
                    [s.flexible]: !cell.column.columnDef.size,
                    [s.actionsCol]: cell.column.id === 'actions' || cell.column.id === 'action',
                  })}
                  style={{ width: cell.column.getSize(), flexBasis: cell.column.getSize() }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );

  const emptyMessages: Record<FilterId, string> = {
    level0: 'No pending members found.',
    level1: 'No verified members found.',
    level2: 'No approved members found.',
    level56: policiesError ? 'Failed to load policies.' : 'No policies found.',
    rejected: 'No rejected members found.',
  };

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Members</span>
          <p className={s.subtitle}>Manage members and roles for LabOS.</p>
        </div>

        <div className={s.tabs}>
          {TAB_IDS.map((id) => (
            <button
              key={id}
              className={clsx(s.tab, { [s.active]: activeFilter === id })}
              onClick={() => setFilter(id)}
            >
              {TAB_LABELS[id]}
              <span className={s.tabCount}>{tabCounts[id]}</span>
            </button>
          ))}
        </div>

        <div className={s.body}>
          {activeFilter === 'level56' ? (
            <>
              <div className={s.controlBar}>
                <input
                  value={policiesSearch}
                  onChange={(e) => setPoliciesSearch(e.target.value)}
                  placeholder="Search policies"
                  className={s.searchInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setPoliciesSearch('');
                  }}
                />
                <select
                  className={s.filterSelect}
                  value={policiesRoleFilter}
                  onChange={(e) => setPoliciesRoleFilter(e.target.value)}
                >
                  <option value="">All roles</option>
                  {policiesRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  className={s.filterSelect}
                  value={policiesGroupFilter}
                  onChange={(e) => setPoliciesGroupFilter(e.target.value)}
                >
                  <option value="">All groups</option>
                  {policiesGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              {renderTableBody(policiesTable, emptyMessages.level56)}
              <PaginationControls table={policiesTable} />
            </>
          ) : (
            <>
              <div className={s.controlBar}>
                <input
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(String(e.target.value))}
                  placeholder="Search members"
                  className={s.searchInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setGlobalFilter('');
                  }}
                />
                {activeFilter === 'level2' && (
                  <>
                    <select
                      className={s.filterSelect}
                      value={approvedGroupFilter}
                      onChange={(e) => setApprovedGroupFilter(e.target.value)}
                    >
                      <option value="">All groups</option>
                      {approvedGroups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <select
                      className={s.filterSelect}
                      value={approvedRoleFilter}
                      onChange={(e) => setApprovedRoleFilter(e.target.value)}
                    >
                      <option value="">All roles</option>
                      {approvedRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {activeFilter !== 'rejected' && <AddMember className={s.addMemberBtn} authToken={authToken} />}
              </div>
              {renderTableBody(table, emptyMessages[activeFilter])}
              <PaginationControls table={table} />
            </>
          )}
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default MembersPage;

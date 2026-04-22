import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { flexRender, PaginationState, SortingState } from '@tanstack/react-table';
import { useCookie } from 'react-use';
import clsx from 'clsx';

import s from './styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { SortIcon } from '../../screens/members/components/icons';
import PaginationControls from '../../screens/members/components/PaginationControls/PaginationControls';

import { useRbacMembers } from '../../hooks/access-control/useRbacMembers';
import { useRbacRoles } from '../../hooks/access-control/useRbacRoles';
import { useRbacPermissions } from '../../hooks/access-control/useRbacPermissions';

import { useMembersTable } from '../../screens/access-control/hooks/useMembersTable';
import { useRolesTable } from '../../screens/access-control/hooks/useRolesTable';
import { usePermissionsTable } from '../../screens/access-control/hooks/usePermissionsTable';

type Tab = 'members' | 'roles' | 'permissions';

const AccessControlPage = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const tab = (router.query.tab as Tab | undefined) ?? 'members';

  // Members tab state
  const [membersSorting, setMembersSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [membersPagination, setMembersPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [membersSearch, setMembersSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Roles tab state
  const [rolesSorting, setRolesSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  // Permissions tab state
  const [permissionsSorting, setPermissionsSorting] = useState<SortingState>([{ id: 'code', desc: false }]);

  // Fetch data
  const { data: membersData } = useRbacMembers({
    authToken,
    search: membersSearch,
    roleCode: roleFilter || undefined,
    page: membersPagination.pageIndex + 1,
    limit: membersPagination.pageSize,
  });

  const { data: rolesData } = useRbacRoles({ authToken });
  const { data: permissionsData } = useRbacPermissions({ authToken });

  // Reset pagination on filter change
  useEffect(() => {
    setMembersPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [membersSearch, roleFilter]);

  // Tables
  const membersPageCount = Math.max(1, membersData?.pagination.pages ?? 1);

  const { table: membersTable } = useMembersTable({
    members: membersData?.members ?? [],
    pageCount: membersPageCount,
    sorting: membersSorting,
    setSorting: setMembersSorting,
    pagination: membersPagination,
    setPagination: setMembersPagination,
  });

  const { table: rolesTable } = useRolesTable({
    roles: rolesData ?? [],
    sorting: rolesSorting,
    setSorting: setRolesSorting,
  });

  const { table: permissionsTable } = usePermissionsTable({
    permissions: permissionsData ?? [],
    sorting: permissionsSorting,
    setSorting: setPermissionsSorting,
  });

  // Redirect non-directory admins
  useEffect(() => {
    if (!authToken) {
      router.push(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  if (!isLoading && user && !isDirectoryAdmin) {
    return null;
  }

  const setTab = (t: Tab) => {
    router.replace({ query: { ...router.query, tab: t } }, undefined, { shallow: true });
  };

  const renderTable = (table: any, emptyMessage = 'No records found.') => (
    <div className={s.table}>
      {/* Header */}
      {table.getHeaderGroups().map((headerGroup: any) => (
        <div key={headerGroup.id} className={s.tableRow}>
          {headerGroup.headers.map((header: any, i: number) =>
            header.isPlaceholder ? null : (
              <div
                key={header.id}
                className={clsx(s.headerCell, {
                  [s.first]: i === 0,
                  [s.fixed]: !!header.column.columnDef.size,
                  [s.flexible]: !header.column.columnDef.size,
                  [s.actionsCell]: header.column.id === 'actions',
                  [s.actionsCellFill]: header.column.id === 'actions' && !header.column.columnDef.size,
                })}
                style={
                  header.column.id === 'actions' && !header.column.columnDef.size
                    ? { flex: '1 1 auto', minWidth: 0, width: 'auto' }
                    : {
                        width: header.column.getSize(),
                        flexBasis: header.column.getSize(),
                      }
                }
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getCanSort() && <SortIcon />}
              </div>
            )
          )}
        </div>
      ))}

      {/* Body */}
      {table.getRowModel().rows.length === 0 ? (
        <div className={s.emptyState}>{emptyMessage}</div>
      ) : (
        table.getRowModel().rows.map((row: any) => (
          <div key={row.id} className={s.tableRow}>
            {row.getVisibleCells().map((cell: any, i: number) => (
              <div
                key={cell.id}
                className={clsx(s.bodyCell, {
                  [s.first]: i === 0,
                  [s.fixed]: !!cell.column.columnDef.size,
                  [s.flexible]: !cell.column.columnDef.size,
                  [s.actionsCell]: cell.column.id === 'actions',
                  [s.actionsCellFill]: cell.column.id === 'actions' && !cell.column.columnDef.size,
                })}
                style={
                  cell.column.id === 'actions' && !cell.column.columnDef.size
                    ? { flex: '1 1 auto', minWidth: 0, width: 'auto' }
                    : {
                        width: cell.column.getSize(),
                        flexBasis: cell.column.getSize(),
                      }
                }
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Access Control</span>
          <p className={s.subtitle}>Manage roles and permissions for members across the directory.</p>
        </div>

        <div className={s.tabs}>
          <button className={clsx(s.tab, { [s.active]: tab === 'members' })} onClick={() => setTab('members')}>
            Members
          </button>
          <button className={clsx(s.tab, { [s.active]: tab === 'roles' })} onClick={() => setTab('roles')}>
            Roles
          </button>
          <button className={clsx(s.tab, { [s.active]: tab === 'permissions' })} onClick={() => setTab('permissions')}>
            Permissions
          </button>
        </div>

        <div className={s.body}>
          {tab === 'members' && (
            <>
              <div className={s.controlBar}>
                <input
                  value={membersSearch}
                  onChange={(e) => setMembersSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className={s.searchInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setMembersSearch('');
                  }}
                />
                <select className={s.filterSelect} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="">All roles</option>
                  {rolesData?.map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
              {renderTable(membersTable)}
              <PaginationControls table={membersTable} />
            </>
          )}

          {tab === 'roles' && (
            <>
              <div className={s.controlBar}>
                <div className={s.placeholderControl} />
              </div>
              {renderTable(rolesTable, 'No roles found.')}
            </>
          )}

          {tab === 'permissions' && (
            <>
              <div className={s.controlBar}>
                <div className={s.placeholderControl} />
              </div>
              {renderTable(permissionsTable, 'No permissions found.')}
            </>
          )}
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default AccessControlPage;

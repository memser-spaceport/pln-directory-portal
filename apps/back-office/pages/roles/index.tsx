import React, { useEffect, useMemo, useState } from 'react';

import s from '../members/styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { ColumnFiltersState, flexRender, PaginationState, SortingState } from '@tanstack/react-table';
import clsx from 'clsx';
import { useCookie } from 'react-use';

import { useMembersList } from '../../hooks/members/useMembersList';
import PaginationControls from '../../screens/members/components/PaginationControls/PaginationControls';
import { SortIcon } from '../../screens/members/components/icons';
import { useRolesTable } from '../../screens/roles/hooks/useRolesTable';
import { useAuth } from '../../context/auth-context';
import { MemberRole } from '../../utils/constants';

const ALL_ACCESS_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

type RoleFilterValue = '' | MemberRole.DIRECTORY_ADMIN | MemberRole.DEMO_DAY_ADMIN;

const RolesPage = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'name',
      desc: false,
    },
  ]);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const [globalFilter, setGlobalFilter] = useState<string>('');
  const [columnFilters] = useState<ColumnFiltersState>([]);
  const [roleFilter, setRoleFilter] = useState<RoleFilterValue>('');

  const { data } = useMembersList({
    authToken,
    accessLevel: ALL_ACCESS_LEVELS,
  });

  // Filter members by role before passing to the table
  const filteredMembers = useMemo(() => {
    if (!data?.data) return [];
    if (!roleFilter) return data.data;

    return data.data.filter((member) => {
      const roles = member.roles || [];
      const memberRoleNames = member.memberRoles?.map((r) => r.name) || [];
      const allRoles = [...roles, ...memberRoleNames];
      return allRoles.includes(roleFilter);
    });
  }, [data?.data, roleFilter]);

  const { table } = useRolesTable({
    members: filteredMembers,
    sorting,
    setSorting,
    pagination,
    setPagination,
    globalFilter,
    setGlobalFilter,
  });

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  if (!isLoading && user && !isDirectoryAdmin) {
    return null;
  }

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Roles</span>

          <span className={s.filters}>
            <input
              value={globalFilter}
              onChange={(e) => table.setGlobalFilter(String(e.target.value))}
              placeholder="Filter by name or email"
              className={clsx(s.input)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  table.setGlobalFilter('');
                }
              }}
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilterValue)}
              className={clsx(s.input)}
              style={{ marginLeft: 8, minWidth: 160 }}
            >
              <option value="">All roles</option>
              <option value={MemberRole.DIRECTORY_ADMIN}>Directory Admin</option>
              <option value={MemberRole.DEMO_DAY_ADMIN}>Demo Day Admin</option>
            </select>
          </span>
        </div>

        <div className={s.body}>
          <div className={s.table}>
            {/* Header */}
            {table.getHeaderGroups().map((headerGroup) => (
              <div key={headerGroup.id} className={s.tableRow}>
                {headerGroup.headers.map((header, i) => {
                  if (header.isPlaceholder) return null;

                  return (
                    <div
                      key={header.id}
                      className={clsx(s.headerCell, {
                        [s.first]: i === 0,
                        [s.last]: i === headerGroup.headers.length - 1,
                        [s.sortable]: header.column.getCanSort(),
                        [s.fixed]: !!header.column.columnDef.size,
                        [s.flexible]: !header.column.columnDef.size,
                      })}
                      style={{
                        width: header.column.getSize(),
                        flexBasis: header.column.getSize(),
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className={s.headerCellInner}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && <SortIcon />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Body */}
            {table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <div className={s.tableRow}>
                  {row.getVisibleCells().map((cell, i) => (
                    <div
                      key={cell.id}
                      className={clsx(s.bodyCell, {
                        [s.first]: i === 0,
                        [s.last]: i === row.getVisibleCells().length - 1,
                        [s.fixed]: !!cell.column.columnDef.size,
                        [s.flexible]: !cell.column.columnDef.size,
                      })}
                      style={{
                        width: cell.column.getSize(),
                        flexBasis: cell.column.getSize(),
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className={s.footer}>
          <PaginationControls table={table} />
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default RolesPage;

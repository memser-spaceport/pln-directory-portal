import React, { Dispatch, SetStateAction, useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import clsx from 'clsx';

import { Member } from '../../types/member';
import { MemberCell } from '../MemberCell/MemberCell';
import { ProjectsCell } from '../ProjectsCell/ProjectsCell';
import { EditCell } from '../EditCell/EditCell';
import PaginationControls from '../PaginationControls/PaginationControls';
import s from './MembersTableV2.module.scss';

interface Props {
  members: Member[];
  authToken: string;
  activeTab: string;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
}

const columnHelper = createColumnHelper<Member>();

export function MembersTableV2({
  members,
  authToken,
  activeTab,
  pagination,
  setPagination,
  globalFilter,
  sorting,
  setSorting,
}: Props) {
  const columns = useMemo(
    () => {
      const base = [
        columnHelper.accessor('name', {
          header: 'Member',
          cell: (info) => <MemberCell member={info.row.original} />,
          size: 350,
          sortingFn: 'alphanumeric',
        }),
        columnHelper.display({
          id: 'teamProject',
          header: 'Team/Project',
          cell: (info) => <ProjectsCell member={info.row.original} />,
          size: 0,
        }),
      ];

      const approvedExtras = activeTab === 'APPROVED' ? [
        columnHelper.display({
          id: 'role',
          header: 'Role',
          cell: (info) => {
            const roles = info.row.original.roles ?? [];
            if (!roles.length) return <span>—</span>;
            return (
              <div className={s.stackedCell}>
                {roles.map((r) => <span key={r.code}>{r.name}</span>)}
              </div>
            );
          },
          size: 160,
        }),
        columnHelper.display({
          id: 'group',
          header: 'Group',
          cell: (info) => {
            const policies = info.row.original.policies ?? [];
            if (!policies.length) return <span>—</span>;
            return (
              <div className={s.badgeRow}>
                {policies.map((p) => (
                  <span key={p.code} className={s.groupBadge}>{p.name}</span>
                ))}
              </div>
            );
          },
          size: 180,
        }),
        columnHelper.display({
          id: 'exceptions',
          header: 'Exceptions',
          cell: (info) => {
            const perms = info.row.original.permissions ?? [];
            if (!perms.length) return <span>—</span>;
            return (
              <div className={s.badgeRow}>
                {perms.map((p) => (
                  <span key={p.code} className={s.exceptionBadge}>⚠️ {p.code}</span>
                ))}
              </div>
            );
          },
          size: 200,
        }),
      ] : [];

      return [
        ...base,
        ...approvedExtras,
        columnHelper.display({
          id: 'actions',
          header: 'Actions',
          cell: (info) => <EditCell member={info.row.original} authToken={authToken} />,
          size: 100,
        }),
      ];
    },
    [authToken, activeTab]
  );

  const table = useReactTable({
    data: members,
    columns,
    state: { pagination, globalFilter, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _, value) => {
      const m = row.original;
      const q = (value as string).toLowerCase();
      return (
        (m.name?.toLowerCase().includes(q) ?? false) ||
        (m.email?.toLowerCase().includes(q) ?? false) ||
        (m.projectContributions?.some((p) => p.project.name.toLowerCase().includes(q)) ?? false)
      );
    },
    getRowId: (row) => row.uid,
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={s.wrapper}>
      <div className={s.root}>
        <div className={s.headerRow}>
          {table.getHeaderGroups().map((hg) =>
            hg.headers.map((header) => (
              <div
                key={header.id}
                className={clsx(s.headerCell, {
                  [s.fixed]: !!header.column.columnDef.size,
                  [s.flexible]: !header.column.columnDef.size,
                })}
                style={{
                  width: header.column.getSize(),
                  flexBasis: header.column.getSize(),
                }}
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))
          )}
        </div>

        {rows.length === 0 ? (
          <div className={s.emptyState}>No members</div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className={s.bodyRow}>
              {row.getVisibleCells().map((cell) => (
                <div
                  key={cell.id}
                  className={clsx(s.bodyCell, {
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
          ))
        )}
      </div>

      <PaginationControls table={table} />
    </div>
  );
}

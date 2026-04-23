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
import { EditCell } from '../EditCell/EditCell';
import PaginationControls from '../PaginationControls/PaginationControls';
import s from './MembersTableV2.module.scss';

interface Props {
  members: Member[];
  authToken: string;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
}

function TeamProjectCell({ member }: { member: Member }) {
  const teams = member.teamMemberRoles?.map((r) => r.team) ?? [];
  const projects = member.projectContributions?.map((c) => c.project) ?? [];
  const items = [...teams, ...projects];
  if (items.length === 0) return <span>—</span>;
  return (
    <span>
      {items.map((item, i) => (
        <span key={item.uid}>
          {i > 0 && ', '}
          {item.name}
        </span>
      ))}
    </span>
  );
}

const columnHelper = createColumnHelper<Member>();

export function MembersTableV2({
  members,
  authToken,
  pagination,
  setPagination,
  globalFilter,
  sorting,
  setSorting,
}: Props) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Member',
        cell: (info) => <MemberCell member={info.row.original} />,
        size: 200,
        sortingFn: 'alphanumeric',
      }),
      columnHelper.display({
        id: 'teamProject',
        header: 'Team/Project',
        cell: (info) => <TeamProjectCell member={info.row.original} />,
        size: 0,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => <EditCell member={info.row.original} authToken={authToken} />,
        size: 100,
      }),
    ],
    [authToken]
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

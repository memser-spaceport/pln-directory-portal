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
import { EditMember } from '../EditMember/EditMember';
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
        size: 0,
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
        cell: (info) => (
          <EditMember uid={info.row.original.uid} authToken={authToken} />
        ),
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
        (m.projectContributions?.some((p) =>
          p.project.name.toLowerCase().includes(q)
        ) ??
          false)
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
                className={clsx(s.headerCell, header.column.getSize() === 0 ? s.flexible : s.fixed)}
                style={header.column.getSize() !== 0 ? { width: header.column.getSize() } : undefined}
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
                  className={clsx(s.bodyCell, cell.column.getSize() === 0 ? s.flexible : s.fixed)}
                  style={cell.column.getSize() !== 0 ? { width: cell.column.getSize() } : undefined}
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

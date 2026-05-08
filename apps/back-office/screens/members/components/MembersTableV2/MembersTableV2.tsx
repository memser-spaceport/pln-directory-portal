import React, { Dispatch, SetStateAction, useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
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
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pageCount: number;
  totalRowCount?: number;
  showRbacSection?: boolean;
}

const columnHelper = createColumnHelper<Member>();

function formatJoinedDate(iso: string | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).format(d);
}

function columnLayoutClass(columnId: string) {
  switch (columnId) {
    case 'name':
      return s.colMember;
    case 'teamProject':
      return s.colTeam;
    case 'joined':
      return s.colJoined;
    case 'role':
      return s.colRole;
    case 'group':
      return s.colGroup;
    case 'exceptions':
      return s.colExceptions;
    case 'actions':
      return s.colActions;
    default:
      return '';
  }
}

export function MembersTableV2({
  members,
  authToken,
  activeTab,
  pagination,
  setPagination,
  sorting,
  setSorting,
  pageCount,
  totalRowCount,
  showRbacSection = false,
}: Props) {
  const columns = useMemo(() => {
    const base = [
      columnHelper.accessor('name', {
        header: 'Member',
        cell: (info) => <MemberCell member={info.row.original} />,
        size: 340,
        sortingFn: 'alphanumeric',
      }),
      columnHelper.display({
        id: 'teamProject',
        header: 'Team/Project',
        enableSorting: false,
        cell: (info) => <ProjectsCell member={info.row.original} />,
        size: 280,
      }),
    ];

    const joinedColumn = columnHelper.display({
      id: 'joined',
      header: 'Joined',
      enableSorting: true,
      cell: (info) => {
        const raw = info.row.original.createdAt;
        return (
          <span
            className={s.joinedText}
            title={raw ? new Date(raw).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : undefined}
          >
            {formatJoinedDate(raw)}
          </span>
        );
      },
      size: 76,
    });

    const approvedExtras =
      activeTab === 'APPROVED'
        ? [
            columnHelper.display({
              id: 'role',
              header: 'Role',
              enableSorting: false,
              cell: (info) => {
                const roles = [
                  ...new Set((info.row.original.policies ?? []).map((p) => p.role).filter(Boolean) as string[]),
                ];
                if (!roles.length) return <span>—</span>;
                return (
                  <div className={s.stackedCell}>
                    {roles.map((r) => (
                      <span key={r}>{r}</span>
                    ))}
                  </div>
                );
              },
              size: 160,
            }),
            columnHelper.display({
              id: 'group',
              header: 'Group',
              enableSorting: false,
              cell: (info) => {
                const groups = [
                  ...new Set((info.row.original.policies ?? []).map((p) => p.group).filter(Boolean) as string[]),
                ];
                if (!groups.length) return <span>—</span>;
                return (
                  <div className={s.badgeRow}>
                    {groups.map((g) => (
                      <span key={g} className={s.groupBadge}>
                        {g}
                      </span>
                    ))}
                  </div>
                );
              },
              size: 148,
            }),
            columnHelper.display({
              id: 'exceptions',
              header: 'Permission Extension',
              enableSorting: false,
              cell: (info) => {
                const perms = info.row.original.permissions ?? [];
                if (!perms.length) return <span>—</span>;
                return (
                  <div className={s.badgeRow}>
                    {perms.map((p) => (
                      <span key={p.code} className={s.exceptionBadge}>
                        <span className={s.exceptionCode}>{p.code}</span>
                      </span>
                    ))}
                  </div>
                );
              },
              size: 168,
            }),
          ]
        : [];

    return [
      ...base,
      ...approvedExtras,
      joinedColumn,
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: (info) => <EditCell member={info.row.original} authToken={authToken} showRbacSection={showRbacSection} />,
        size: 108,
      }),
    ];
  }, [authToken, activeTab, showRbacSection]);

  const table = useReactTable({
    data: members,
    columns,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    manualPagination: true,
    manualSorting: true,
    pageCount,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.uid,
    autoResetPageIndex: false,
  });

  const rows = table.getRowModel().rows;
  const showingFrom =
    typeof totalRowCount === 'number' && totalRowCount > 0 && rows.length > 0
      ? pagination.pageIndex * pagination.pageSize + 1
      : 0;
  const showingTo =
    typeof totalRowCount === 'number' && totalRowCount > 0 && rows.length > 0
      ? pagination.pageIndex * pagination.pageSize + rows.length
      : 0;

  return (
    <div className={s.wrapper}>
      <div className={s.root}>
        <div className={s.headerRow}>
          {table.getHeaderGroups().map((hg) =>
            hg.headers.map((header) => (
              <div
                key={header.id}
                className={clsx(s.headerCell, columnLayoutClass(header.column.id), !header.column.getCanSort() && s.headerStatic)}
                onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            )),
          )}
        </div>

        {rows.length === 0 ? (
          <div className={s.emptyState}>No members</div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className={s.bodyRow}>
              {row.getVisibleCells().map((cell) => {
                return (
                  <div
                    key={cell.id}
                    className={clsx(s.bodyCell, columnLayoutClass(cell.column.id))}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {typeof totalRowCount === 'number' && rows.length > 0 && (
        <p className={s.rangeFooter}>
          Showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of {totalRowCount.toLocaleString()}
        </p>
      )}

      {pageCount > 0 ? <PaginationControls table={table} /> : null}
    </div>
  );
}

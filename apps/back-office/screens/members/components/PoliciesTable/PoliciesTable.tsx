import React, { Dispatch, SetStateAction } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  PaginationState,
  useReactTable,
} from '@tanstack/react-table';
import clsx from 'clsx';

import { Policy } from '../../../../hooks/access-control/usePoliciesList';
import PaginationControls from '../PaginationControls/PaginationControls';
import s from './PoliciesTable.module.scss';

interface Props {
  policies: Policy[];
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
}

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L3 7V12C3 16.55 6.84 20.74 12 22C17.16 20.74 21 16.55 21 12V7L12 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 12L11 14L15 10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const ModulesCell = ({ permissions }: { permissions: string[] }) => {
  if (!permissions.length) return <span className={s.muted}>—</span>;
  const visible = permissions.slice(0, 2);
  const overflow = permissions.length - 2;
  return (
    <div className={s.badgeRow}>
      {visible.map((p) => (
        <span key={p} className={s.moduleBadge}>{p}</span>
      ))}
      {overflow > 0 && <span className={s.overflowBadge}>+{overflow}</span>}
    </div>
  );
};

const columnHelper = createColumnHelper<Policy>();

const columns = [
  columnHelper.display({
    id: 'policy',
    size: 220,
    header: () => 'Policy',
    cell: (info) => (
      <div className={s.policyCell}>
        <ShieldIcon />
        <span className={s.policyName}>{info.row.original.name}</span>
      </div>
    ),
  }),
  columnHelper.accessor('role', {
    size: 160,
    header: 'Role',
  }),
  columnHelper.display({
    id: 'group',
    size: 130,
    header: () => 'Group',
    cell: (info) => <span className={s.groupBadge}>{info.row.original.group}</span>,
  }),
  columnHelper.accessor('description', {
    size: 0,
    header: 'Description',
    cell: (info) => info.getValue() ?? <span className={s.muted}>—</span>,
  }),
  columnHelper.display({
    id: 'modules',
    size: 200,
    header: () => 'Modules',
    cell: (info) => <ModulesCell permissions={info.row.original.permissions} />,
  }),
  columnHelper.accessor('assignmentsCount', {
    size: 90,
    header: 'Members',
  }),
  columnHelper.display({
    id: 'action',
    size: 80,
    header: () => 'Action',
    cell: () => (
      <button type="button" className={s.viewBtn}>
        <EyeIcon /> View
      </button>
    ),
  }),
];

export function PoliciesTable({ policies, pagination, setPagination, globalFilter }: Props) {
  const table = useReactTable({
    data: policies,
    columns,
    state: { pagination, globalFilter },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _colId, value: string) => {
      const q = value.toLowerCase();
      return (
        row.original.name.toLowerCase().includes(q) ||
        (row.original.description ?? '').toLowerCase().includes(q)
      );
    },
    getRowId: (row) => row.uid,
    autoResetPageIndex: false,
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
                  width: header.column.getSize() || undefined,
                  flexBasis: header.column.getSize() || undefined,
                }}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))
          )}
        </div>

        {rows.length === 0 ? (
          <div className={s.emptyState}>No policies found.</div>
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
                    width: cell.column.getSize() || undefined,
                    flexBasis: cell.column.getSize() || undefined,
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

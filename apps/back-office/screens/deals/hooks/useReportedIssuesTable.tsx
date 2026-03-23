import React, { Dispatch, SetStateAction, useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ReportedIssue } from '../types/deal';

const columnHelper = createColumnHelper<ReportedIssue>();

type UseReportedIssuesTableArgs = {
  issues: ReportedIssue[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
};

export function useReportedIssuesTable({
  issues,
  sorting,
  setSorting,
  pagination,
  setPagination,
}: UseReportedIssuesTableArgs) {
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'vendor',
        header: 'Vendor',
        size: 160,
        cell: (info) => info.row.original.deal.vendorName,
      }),
      columnHelper.display({
        id: 'reportedBy',
        header: 'Reported By',
        size: 200,
        cell: (info) => {
          const { authorMember } = info.row.original;
          return (
            <div>
              <div>{authorMember.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{authorMember.email}</div>
            </div>
          );
        },
      }),
      columnHelper.accessor('description', {
        header: 'Issue',
        cell: (info) => (
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 340,
            }}
          >
            {info.getValue()}
          </div>
        ),
        size: 0,
        enableSorting: false,
      }),
      columnHelper.accessor('createdAt', {
        header: 'Reported At',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        size: 140,
        enableSorting: true,
        sortingFn: 'datetime',
      }),
    ],
    []
  );

  const data = useMemo(() => issues ?? [], [issues]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: (row) => row.uid,
  });

  return { table };
}

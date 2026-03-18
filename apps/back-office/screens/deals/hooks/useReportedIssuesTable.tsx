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
      columnHelper.accessor('vendorName', {
        header: 'Vendor',
        sortingFn: 'alphanumeric',
        cell: (info) => info.getValue(),
        size: 160,
      }),
      columnHelper.accessor('reportedBy', {
        header: 'Reported By',
        cell: (info) => (
          <div>
            <div>{info.getValue()}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{info.row.original.reportedByEmail}</div>
          </div>
        ),
        size: 200,
        enableSorting: false,
      }),
      columnHelper.accessor('issueDescription', {
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
      columnHelper.accessor('reportedAt', {
        header: 'Reported At',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        size: 140,
        enableSorting: true,
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

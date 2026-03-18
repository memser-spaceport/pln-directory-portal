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
import { SubmittedDeal } from '../types/deal';

const columnHelper = createColumnHelper<SubmittedDeal>();

type UseSubmittedDealsTableArgs = {
  deals: SubmittedDeal[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
};

export function useSubmittedDealsTable({
  deals,
  sorting,
  setSorting,
  pagination,
  setPagination,
}: UseSubmittedDealsTableArgs) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('vendorName', {
        header: 'Vendor',
        sortingFn: 'alphanumeric',
        cell: (info) => info.getValue(),
        size: 0,
      }),
      columnHelper.accessor('submittedBy', {
        header: 'Submitted By',
        cell: (info) => (
          <div>
            <div>{info.getValue()}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{info.row.original.submittedByEmail}</div>
          </div>
        ),
        size: 200,
        enableSorting: false,
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => info.getValue(),
        size: 150,
        enableSorting: false,
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => (
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 300,
            }}
          >
            {info.getValue()}
          </div>
        ),
        size: 0,
        enableSorting: false,
      }),
      columnHelper.accessor('submittedAt', {
        header: 'Submitted At',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        size: 140,
        enableSorting: true,
      }),
    ],
    []
  );

  const data = useMemo(() => deals ?? [], [deals]);

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

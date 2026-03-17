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
import { Deal, DealStatus } from '../types/deal';
import { VendorCell } from '../components/VendorCell/VendorCell';
import { StatusBadge } from '../components/StatusBadge/StatusBadge';
import { IssuesBadge } from '../components/IssuesBadge/IssuesBadge';
import { ActionMenu } from '../components/ActionMenu/ActionMenu';

const columnHelper = createColumnHelper<Deal>();

type UseDealsTableArgs = {
  deals: Deal[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
  onEdit: (deal: Deal) => void;
  onStatusChange: (uid: string, status: DealStatus) => void;
};

export function useDealsTable({
  deals,
  sorting,
  setSorting,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
  onEdit,
  onStatusChange,
}: UseDealsTableArgs) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('vendorName', {
        header: 'Vendor',
        sortingFn: 'alphanumeric',
        cell: (info) => <VendorCell deal={info.row.original} />,
        size: 0,
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => info.getValue(),
        size: 160,
        enableSorting: false,
      }),
      columnHelper.accessor('audience', {
        header: 'Audience',
        cell: (info) => info.getValue(),
        size: 180,
        enableSorting: false,
      }),
      columnHelper.accessor('markedAsUsingCount', {
        header: 'Using',
        cell: (info) => info.getValue() ?? '—',
        size: 80,
        enableSorting: true,
        meta: { align: 'center' },
      }),
      columnHelper.accessor('tappedHowToRedeemCount', {
        header: 'Redeem Taps',
        cell: (info) => info.getValue() ?? '—',
        size: 120,
        enableSorting: true,
        meta: { align: 'center' },
      }),
      columnHelper.accessor('submittedIssuesCount', {
        header: 'Issues',
        cell: (info) => <IssuesBadge count={info.getValue()} />,
        size: 100,
        enableSorting: true,
        meta: { align: 'center' },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue()} />,
        size: 120,
        enableSorting: true,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <ActionMenu
            deal={info.row.original}
            onEdit={onEdit}
            onStatusChange={onStatusChange}
          />
        ),
        size: 56,
        enableResizing: false,
        meta: { align: 'center' },
      }),
    ],
    [onEdit, onStatusChange]
  );

  const data = useMemo(() => deals ?? [], [deals]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
      globalFilter,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.uid,
  });

  return { table };
}

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
      // 1. Vendor
      columnHelper.accessor('vendorName', {
        header: 'Vendor',
        sortingFn: 'alphanumeric',
        cell: (info) => <VendorCell deal={info.row.original} />,
        size: 0,
      }),
      // 2. Category
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => info.getValue(),
        size: 180,
        enableSorting: false,
      }),
      // 3. Audience
      columnHelper.accessor('audience', {
        header: 'Audience',
        cell: (info) => info.getValue(),
        size: 150,
        enableSorting: false,
      }),
      // 4. Tapped How to Redeem
      columnHelper.accessor('tappedHowToRedeemCount', {
        header: 'Tapped How to Redeem',
        cell: (info) => info.getValue() ?? 0,
        size: 130,
        enableSorting: true,
      }),
      // 5. Marked as Using
      columnHelper.accessor('markedAsUsingCount', {
        header: 'Marked as Using',
        cell: (info) => info.getValue() ?? 0,
        size: 120,
        enableSorting: true,
      }),
      // 6. Status
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue()} />,
        size: 120,
        enableSorting: true,
      }),
      // 7. Last Updated
      columnHelper.accessor('updatedAt', {
        header: 'Last Updated',
        cell: (info) => {
          const date = new Date(info.getValue());
          return (
            <div>
              <div>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          );
        },
        size: 140,
        enableSorting: true,
      }),
      // 8. Action
      columnHelper.display({
        id: 'actions',
        header: 'Action',
        cell: (info) => (
          <ActionMenu
            deal={info.row.original}
            onEdit={onEdit}
            onStatusChange={onStatusChange}
          />
        ),
        size: 80,
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

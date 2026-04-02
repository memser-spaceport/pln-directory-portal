import React, { useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from '@tanstack/react-table';
import { RoleWithCounts } from '../types';
import { useRouter } from 'next/router';

const columnHelper = createColumnHelper<RoleWithCounts>();

interface UseRolesTableArgs {
  roles: RoleWithCounts[];
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
}

export function useRolesTable({ roles, sorting, setSorting }: UseRolesTableArgs) {
  const router = useRouter();

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Role',
        cell: (info) => (
          <div className="text-sm font-medium text-gray-900">{info.getValue()}</div>
        ),
        size: 200,
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => (
          <div className="text-sm text-gray-600 truncate max-w-xs">
            {info.getValue() || '-'}
          </div>
        ),
        size: 0,
        enableSorting: false,
      }),
      columnHelper.accessor('memberCount', {
        header: 'Members Count',
        cell: (info) => (
          <div className="text-sm text-gray-900">{info.getValue()}</div>
        ),
        size: 130,
      }),
      columnHelper.accessor('permissionCount', {
        header: 'Permission Count',
        cell: (info) => (
          <div className="text-sm text-gray-900">{info.getValue()}</div>
        ),
        size: 140,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <button
            onClick={() => router.push(`/access-control/roles/${info.row.original.code}`)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Edit
          </button>
        ),
        size: 80,
        enableSorting: false,
      }),
    ],
    [router]
  );

  const data = useMemo(() => roles, [roles]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    getRowId: (row) => row.code,
  });

  return { table };
}

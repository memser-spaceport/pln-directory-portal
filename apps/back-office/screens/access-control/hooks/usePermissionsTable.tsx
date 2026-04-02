import React, { useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from '@tanstack/react-table';
import { PermissionWithCounts } from '../types';
import { useRouter } from 'next/router';

const columnHelper = createColumnHelper<PermissionWithCounts>();

interface UsePermissionsTableArgs {
  permissions: PermissionWithCounts[];
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
}

export function usePermissionsTable({ permissions, sorting, setSorting }: UsePermissionsTableArgs) {
  const router = useRouter();

  const columns = useMemo(
    () => [
      columnHelper.accessor('code', {
        header: 'Permission',
        cell: (info) => (
          <div className="text-sm font-medium text-gray-900">{info.getValue()}</div>
        ),
        size: 250,
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
      columnHelper.accessor('roleCount', {
        header: 'Roles Count',
        cell: (info) => (
          <div className="text-sm text-gray-900">{info.getValue()}</div>
        ),
        size: 120,
      }),
      columnHelper.display({
        id: 'memberCount',
        header: 'Members Count',
        cell: (info) => {
          const permission = info.row.original;
          // Total unique members (direct + from roles, need to calculate unique)
          const totalMembers = permission.directMembers.length + permission.roles.reduce((acc, role) => acc + (role as any).memberCount || 0, 0);
          return <div className="text-sm text-gray-900">{totalMembers || permission.directMemberCount}</div>;
        },
        size: 130,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <button
            onClick={() => router.push(`/access-control/permissions/${info.row.original.code}`)}
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

  const data = useMemo(() => permissions, [permissions]);

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

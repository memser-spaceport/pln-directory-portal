import React, { useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  PaginationState,
  SortingState,
} from '@tanstack/react-table';
import { MemberWithRoles } from '../types';
import MemberCell from '../components/MemberCell';
import TeamCell from '../components/TeamCell';
import RoleTagsCell from '../components/RoleTagsCell';
import { useRouter } from 'next/router';

const columnHelper = createColumnHelper<MemberWithRoles>();

interface UseMembersTableArgs {
  members: MemberWithRoles[];
  pageCount: number;
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>;
}

export function useMembersTable({
  members,
  pageCount,
  sorting,
  setSorting,
  pagination,
  setPagination,
}: UseMembersTableArgs) {
  const router = useRouter();

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Member',
        cell: (info) => <MemberCell member={info.row.original} />,
        size: 320,
        maxSize: 320,
      }),
      columnHelper.accessor('projectContributions', {
        header: 'Team',
        cell: (info) => <TeamCell projectContributions={info.row.original.projectContributions} />,
        size: 200,
        enableSorting: false,
      }),
      columnHelper.accessor('roles', {
        header: 'Assigned Roles',
        cell: (info) => <RoleTagsCell roles={info.row.original.roles} />,
        size: 400,
        enableSorting: false,
      }),
      columnHelper.accessor('directPermissions', {
        header: 'Direct Permissions',
        cell: (info) => (
          <div className="text-sm text-gray-600">
            {info.row.original.directPermissions.length > 0
              ? `${info.row.original.directPermissions.length} permission${
                  info.row.original.directPermissions.length > 1 ? 's' : ''
                }`
              : '-'}
          </div>
        ),
        size: 150,
        enableSorting: false,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <button
            onClick={() => router.push(`/access-control/members/${info.row.original.uid}`)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Edit
          </button>
        ),
        size: 0,
        minSize: 0,
        enableSorting: false,
      }),
    ],
    [router]
  );

  const data = useMemo(() => members, [members]);

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
    manualPagination: true,
    pageCount,
  });

  return { table };
}

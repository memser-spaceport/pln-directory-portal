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
import { Row } from '@tanstack/table-core/src/types';

import { Member } from '../../members/types/member';
import MemberCell from '../../members/components/MemberCell/MemberCell';
import RoleCell, { PendingRoleChange, PendingHostChange } from '../../members/components/RoleCell/RoleCell';
import { StatusCell } from '../../members/components/StatusCell/StatusCell';
import ProjectsCell from '../../members/components/ProjectsCell/ProjectsCell';

const columnHelper = createColumnHelper<Member>();

type UseRolesTableArgs = {
  members: Member[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
  onRoleChange?: (change: PendingRoleChange | null, memberUid: string) => void;
  onHostChange?: (change: PendingHostChange | null, memberUid: string) => void;
  authToken?: string;
};

export function useRolesTable({
  members,
  sorting,
  setSorting,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
  onRoleChange,
  onHostChange,
  authToken,
}: UseRolesTableArgs) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Member',
        sortingFn: 'alphanumeric',
        cell: (info) => <MemberCell member={info.row.original} />,
        size: 260,
      }),
      columnHelper.display({
        id: 'role',
        header: 'Role / Demo day scope',
        cell: (info) => (
          <RoleCell
            member={info.row.original}
            onRoleChange={(change) => onRoleChange?.(change, info.row.original.uid)}
            onHostChange={(change) => onHostChange?.(change, info.row.original.uid)}
          />
        ),
        size: 0,
        enableResizing: false,
        enableSorting: false,
      }),
      columnHelper.accessor('accessLevel', {
        header: 'Status',
        sortingFn: (rowA: Row<Member>, rowB: Row<Member>) => {
          if (rowA.original.accessLevelUpdatedAt > rowB.original.accessLevelUpdatedAt) {
            return 1;
          }

          if (rowA.original.accessLevelUpdatedAt < rowB.original.accessLevelUpdatedAt) {
            return -1;
          }

          return 0;
        },
        cell: (info) => (authToken ? <StatusCell member={info.row.original} authToken={authToken} /> : null),
        size: 0,
      }),
      columnHelper.accessor('projectContributions', {
        header: 'Team',
        cell: (info) => <ProjectsCell member={info.row.original} />,
        size: 250,
        enableSorting: false,
      }),
    ],
    [onRoleChange, onHostChange, authToken]
  );

  const data = useMemo(() => members ?? [], [members]);

  const customFilterFn = (row: Row<Member>, _columnId: string, filterValue: string) => {
    const v = filterValue?.toLowerCase?.() ?? '';

    if (!v) return true;

    if (row.original.email?.toLowerCase().includes(v)) return true;
    if (row.original.name?.toLowerCase().includes(v)) return true;

    return false;
  };

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
    globalFilterFn: customFilterFn,
    getRowId: (row) => row.uid,
  });

  return { table };
}

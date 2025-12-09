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
import RoleCell from '../../members/components/RoleCell/RoleCell';

const columnHelper = createColumnHelper<Member>();

type UseRolesTableArgs = {
  members: Member[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
};

export function useRolesTable({
                                members,
                                sorting,
                                setSorting,
                                pagination,
                                setPagination,
                                globalFilter,
                                setGlobalFilter,
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
        cell: (info) => <RoleCell member={info.row.original} />,
        size: 0,
        enableResizing: false,
        enableSorting: false,
        meta: {
          align: 'left',
        },
      }),
    ],
    [],
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

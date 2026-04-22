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

import RoleCell from '../components/RoleCell/RoleCell';
import MemberCell from '../components/MemberCell/MemberCell';
import ProjectsCell from '../components/ProjectsCell/ProjectsCell';
import EditCell from '../components/EditCell/EditCell';
import RbacRolesCell from '../components/RbacRolesCell/RbacRolesCell';
import GroupCell from '../components/GroupCell/GroupCell';
import ExceptionsCell from '../components/ExceptionsCell/ExceptionsCell';

import { Member } from '../types/member';

const columnHelper = createColumnHelper<Member>();

type UseMembersTableArgs = {
  members: Member[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  authToken: string | undefined;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
  mode?: 'members' | 'roles' | 'approved';
};

export function useMembersTable({
  members,
  sorting,
  setSorting,
  authToken,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
  mode = 'members',
}: UseMembersTableArgs) {
  const columns = useMemo(() => {
    if (mode === 'roles') {
      return [
        columnHelper.accessor('name', {
          header: 'Member',
          sortingFn: 'alphanumeric',
          cell: (info) => <MemberCell member={info.row.original} />,
          size: 0,
        }),
        columnHelper.display({
          id: 'role',
          header: 'Role',
          cell: (info) => <RoleCell member={info.row.original} />,
          size: 200,
          enableResizing: false,
          enableSorting: false,
        }),
      ];
    }

    if (mode === 'approved') {
      return [
        columnHelper.accessor('name', {
          header: 'Member',
          sortingFn: 'alphanumeric',
          cell: (info) => <MemberCell member={info.row.original} />,
          size: 0,
        }),
        columnHelper.accessor('projectContributions', {
          header: 'Team/Project',
          cell: (info) => <ProjectsCell member={info.row.original} />,
          size: 0,
          enableSorting: false,
        }),
        columnHelper.display({
          id: 'role',
          header: 'Role',
          cell: (info) => <RbacRolesCell member={info.row.original} />,
          size: 180,
          enableResizing: false,
          enableSorting: false,
        }),
        columnHelper.display({
          id: 'group',
          header: 'Group',
          cell: (info) => <GroupCell member={info.row.original} />,
          size: 160,
          enableResizing: false,
          enableSorting: false,
        }),
        columnHelper.display({
          id: 'exceptions',
          header: 'Exceptions',
          cell: (info) => <ExceptionsCell member={info.row.original} />,
          size: 200,
          enableResizing: false,
          enableSorting: false,
        }),
        columnHelper.display({
          id: 'actions',
          header: 'Actions',
          cell: (props) => <EditCell member={props.row.original} authToken={authToken} />,
          size: 88,
          enableResizing: false,
        }),
      ];
    }

    return [
      columnHelper.accessor('name', {
        header: 'Member',
        sortingFn: 'alphanumeric',
        cell: (info) => <MemberCell member={info.row.original} />,
        size: 0,
      }),
      columnHelper.accessor('projectContributions', {
        header: 'Team/Project',
        cell: (info) => <ProjectsCell member={info.row.original} />,
        size: 0,
        enableSorting: false,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (props) => <EditCell member={props.row.original} authToken={authToken} />,
        size: 88,
        enableResizing: false,
      }),
    ];
  }, [authToken, mode]);

  const data = useMemo(() => members ?? [], [members]);

  const customFilterFn = (row: Row<Member>, _columnId: string, filterValue: string) => {
    const v = filterValue?.toLowerCase?.() ?? '';
    if (!v) return true;
    if (row.original.email?.toLowerCase().includes(v)) return true;
    if (row.original.name?.toLowerCase().includes(v)) return true;
    const projectNames = row.original.projectContributions?.map((p) => p.project.name?.toLowerCase()) ?? [];
    if (projectNames.some((name) => name?.includes(v))) return true;
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

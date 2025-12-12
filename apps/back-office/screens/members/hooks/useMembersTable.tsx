import React, { Dispatch, HTMLProps, SetStateAction, useMemo } from 'react';
import {
  ColumnFiltersState,
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
import LinkedinCell from '../components/LinkedinCell/LinkedinCell';
import SignUpSourceCell from '../components/SignUpSourceCell/SignUpSourceCell';
import StatusCell from '../components/StatusCell/StatusCell';
import EditCell from '../components/EditCell/EditCell';

import { Member } from '../types/member';

const columnHelper = createColumnHelper<Member>();

type UseMembersTableArgs = {
  members: Member[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  rowSelection: Record<string, boolean>;
  setRowSelection: Dispatch<SetStateAction<Record<string, boolean>>>;
  authToken: string | undefined;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: Dispatch<SetStateAction<ColumnFiltersState>>;
  mode?: 'members' | 'roles';
};

export function useMembersTable({
  members,
  sorting,
  setSorting,
  rowSelection,
  setRowSelection,
  authToken,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
  columnFilters,
  setColumnFilters,
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

    return [
      // Checkbox column
      {
        id: 'select',
        header: ({ table }) => (
          <IndeterminateCheckbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <div>
            <IndeterminateCheckbox
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              indeterminate={row.getIsSomeSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          </div>
        ),
        size: 48,
        enableResizing: false,
      },

      // Member cell (avatar + name + email)
      columnHelper.accessor('name', {
        header: 'Member',
        sortingFn: 'alphanumeric',
        cell: (info) => <MemberCell member={info.row.original} />,
        size: 0,
      }),

      // Project / Team column
      columnHelper.accessor('projectContributions', {
        header: 'Project/Team',
        cell: (info) => <ProjectsCell member={info.row.original} />,
        size: 250,
        enableSorting: false,
      }),

      // LinkedIn verified column
      columnHelper.accessor('linkedinProfile', {
        header: 'LinkedIn Verified',
        cell: (info) => <LinkedinCell member={info.row.original} />,
        size: 160,
        enableResizing: false,
        enableSorting: false,
        meta: {
          align: 'center',
        },
      }),

      columnHelper.accessor('signUpSource', {
        header: 'Sign Up Source',
        cell: (info) => <SignUpSourceCell member={info.row.original} />,
        size: 150,
        enableResizing: false,
        enableSorting: true,
      }),

      // Status (access level) column
      columnHelper.accessor('accessLevel', {
        header: 'Access level',
        sortingFn: (rowA: Row<Member>, rowB: Row<Member>) => {
          if (rowA.original.accessLevelUpdatedAt > rowB.original.accessLevelUpdatedAt) {
            return 1;
          }

          if (rowA.original.accessLevelUpdatedAt < rowB.original.accessLevelUpdatedAt) {
            return -1;
          }

          return 0;
        },
        cell: (props) => <StatusCell member={props.row.original} authToken={authToken} />,
        size: 0,
      }),

      columnHelper.display({
        header: 'Info',
        cell: (props) => <EditCell member={props.row.original} authToken={authToken} />,
        size: 88,
        enableResizing: false,
        meta: {
          align: 'center',
        },
      }),
    ];
  }, [authToken, mode]);

  const data = useMemo(() => members ?? [], [members]);

  // Global filter: name, email, project name
  const customFilterFn = (row: Row<Member>, _columnId: string, filterValue: string) => {
    const v = filterValue?.toLowerCase?.() ?? '';

    if (!v) return true;

    if (row.original.email?.toLowerCase().includes(v)) return true;
    if (row.original.name?.toLowerCase().includes(v)) return true;

    const projectNames = row.original.projectContributions?.map((project) => project.project.name?.toLowerCase()) ?? [];

    if (projectNames.some((name) => name?.includes(v))) return true;

    return false;
  };

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination,
      rowSelection,
      globalFilter,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: customFilterFn,
    getRowId: (row) => row.uid,
  });

  return { table };
}

function IndeterminateCheckbox({
  indeterminate,
  className = '',
  ...rest
}: { indeterminate?: boolean } & HTMLProps<HTMLInputElement>) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ref = React.useRef<HTMLInputElement>(null!);

  React.useEffect(() => {
    if (typeof indeterminate === 'boolean') {
      ref.current.indeterminate = !rest.checked && indeterminate;
    }
  }, [ref, indeterminate, rest.checked]);

  return <input type="checkbox" ref={ref} className={className + ' cursor-pointer'} {...rest} />;
}

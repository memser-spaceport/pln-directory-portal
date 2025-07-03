import React, { Dispatch, HTMLProps, SetStateAction, useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import MemberCell from '../components/MemberCell/MemberCell';
import { Member } from '../types/member';
import ProjectsCell from '../components/ProjectsCell/ProjectsCell';
import LinkedinCell from '../components/LinkedinCell/LinkedinCell';
import NewsCell from '../components/NewsCell/NewsCell';
import EditCell from '../components/EditCell/EditCell';
import StatusCell from '../components/StatusCell/StatusCell';
import { Row } from '@tanstack/table-core/src/types';

const columnHelper = createColumnHelper<Member>();

export function useMembersTable({
  members,
  sorting,
  setSorting,
  rowSelection,
  setRowSelection,
  authToken,
  pagination,
  setPagination,
}: {
  rowSelection: Record<string, boolean>;
  setRowSelection: Dispatch<SetStateAction<Record<string, boolean>>>;
  members: Member[];
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  authToken: string;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
}) {
  const columns = useMemo(() => {
    return [
      {
        id: 'select',
        header: ({ table }) => (
          <IndeterminateCheckbox
            {...{
              checked: table.getIsAllRowsSelected(),
              indeterminate: table.getIsSomeRowsSelected(),
              onChange: table.getToggleAllRowsSelectedHandler(),
            }}
          />
        ),
        cell: ({ row }) => (
          <div>
            <IndeterminateCheckbox
              {...{
                checked: row.getIsSelected(),
                disabled: !row.getCanSelect(),
                indeterminate: row.getIsSomeSelected(),
                onChange: row.getToggleSelectedHandler(),
              }}
            />
          </div>
        ),
        size: 48,
        enableResizing: false,
      },
      columnHelper.accessor('name', {
        header: 'Member',
        sortingFn: 'alphanumeric',
        cell: (info) => <MemberCell member={info.row.original} />,
        size: 0,
      }),
      columnHelper.accessor('projectContributions', {
        header: 'Project/Team',
        cell: (info) => <ProjectsCell member={info.row.original} />,
        size: 250,
        enableSorting: false,
      }),
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
      columnHelper.accessor('isSubscribedToNewsletter', {
        header: 'News',
        cell: (info) => <NewsCell member={info.row.original} />,
        size: 80,
        enableResizing: false,
        enableSorting: false,
        meta: {
          align: 'center',
        },
      }),
      columnHelper.accessor('accessLevel', {
        header: 'Status',
        sortingFn: (rowA: Row<Member>, rowB: Row<Member>, columnId: string) => {
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
  }, [authToken]);

  const data = useMemo(() => {
    return members ?? [];
  }, [members]);

  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
      pagination,
    },
    onSortingChange: setSorting,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    getRowId: (row) => {
      return row.uid;
    },
    // initialState: {
    //   sorting: [
    //     {
    //       id: 'accessLevel',
    //       desc: true,
    //     },
    //   ],
    // },
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

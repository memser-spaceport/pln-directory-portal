import React, { Dispatch, HTMLProps, SetStateAction, useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import MemberCell from '../components/MemberCell/MemberCell';
import { Member } from '../types/member';
import ProjectsCell from '../components/ProjectsCell/ProjectsCell';
import LinkedinCell from '../components/LinkedinCell/LinkedinCell';
import NewsCell from '../components/NewsCell/NewsCell';
import EditCell from '../components/EditCell/EditCell';

const columnHelper = createColumnHelper<Member>();

export function useMembersTable({
  members,
  sorting,
  setSorting,
  rowSelection,
  setRowSelection,
}: {
  rowSelection: Record<string, boolean>;
  setRowSelection: Dispatch<SetStateAction<Record<string, boolean>>>;
  members: Member[];
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
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
        sortingFn: 'alphanumeric',
        cell: (info) => <ProjectsCell member={info.row.original} />,
        size: 0,
      }),
      columnHelper.accessor('linkedinProfile', {
        header: 'LinkedIn Verified',
        cell: (info) => <LinkedinCell member={info.row.original} />,
        size: 160,
        enableResizing: false,
        enableSorting: false,
      }),
      columnHelper.accessor('isSubscribedToNewsletter', {
        header: 'News',
        cell: (info) => <NewsCell member={info.row.original} />,
        size: 72,
        enableResizing: false,
        enableSorting: false,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        sortingFn: 'alphanumeric',
        cell: (props) => <div>status dropdown</div>,
        size: 0,
      }),
      columnHelper.display({
        header: 'Info',
        cell: (props) => <EditCell member={props.row.original} />,
        size: 88,
        enableResizing: false,
      }),
    ];
  }, []);

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
    },
    onSortingChange: setSorting,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => {
      return row.id;
    },
    initialState: {
      sorting: [
        {
          id: 'name',
          desc: true,
        },
      ],
    },
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

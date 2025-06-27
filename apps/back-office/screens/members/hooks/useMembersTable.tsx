import React, { Dispatch, SetStateAction, useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';

type Member = {
  email: string;
  id: string;
  imageUrl: string;
  isSubscribedToNewsletter: boolean;
  name: string;
  projectContributions: [];
  skills: 'PENDING';
  teamAndRoles: [];
  status: string;
};

const columnHelper = createColumnHelper<Member>();

export function useMembersTable(
  members: Member[],
  sorting: SortingState,
  setSorting: Dispatch<SetStateAction<SortingState>>
) {
  const columns = useMemo(() => {
    return [
      columnHelper.accessor('name', {
        header: 'Member',
        sortingFn: 'alphanumeric',
        cell: (info) => <div>Name: {info.getValue()}</div>,
      }),
      columnHelper.accessor('projectContributions', {
        header: 'Project/Team',
        sortingFn: 'alphanumeric',
        cell: (props) => <div>Projects here</div>,
      }),
      columnHelper.accessor('isSubscribedToNewsletter', {
        header: 'News',
        cell: (props) => <div>{props.getValue() ? 'Y' : 'N'}</div>,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        sortingFn: 'alphanumeric',
        cell: (props) => <div>status dropdown</div>,
      }),
      columnHelper.display({
        header: 'Info',
        cell: (props) => <div>Exp controls</div>,
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
    },
    onSortingChange: setSorting,
    initialState: {
      sorting: [
        {
          id: 'name',
          desc: true, // sort by name in descending order by default
        },
      ],
    },
  });

  return { table };
}

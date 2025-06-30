import React, { useMemo, useState } from 'react';

import s from './styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { TableFilter } from '../../components/filters/TableFilter/TableFilter';
import { useRouter } from 'next/router';
import { flexRender, PaginationState, SortingState } from '@tanstack/react-table';
import { useMembersTable } from '../../screens/members/hooks/useMembersTable';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { useMembersList } from '../../hooks/members/useMembersList';
import {
  AddIcon,
  Level0Icon,
  Level1Icon,
  Level2Icon,
  RejectedIcon,
  SortIcon,
} from '../../screens/members/components/icons';
import clsx from 'clsx';
import { MultieditControls } from '../../screens/members/components/MultieditControls';
import { useAccessLevelCounts } from '../../hooks/members/useAccessLevelCounts';

const MembersPage = ({ authToken }: { authToken: string | undefined }) => {
  const router = useRouter();
  const query = router.query;
  const { filter } = query;
  const { data: counts } = useAccessLevelCounts({ authToken });
  const items = useMemo(() => {
    return [
      {
        id: 'level1',
        icon: <Level1Icon />,
        label: 'L1',
        count: counts?.L1 ?? 0,
      },
      {
        id: 'level2',
        icon: <Level2Icon />,
        label: 'L2-L4',
        count: (counts?.L2 ?? 0) + (counts?.L3 ?? 0) + (counts?.L4 ?? 0),
      },
      {
        id: 'level0',
        icon: <Level0Icon />,
        label: 'L0',
        count: counts?.L0 ?? 0,
      },
      {
        id: 'rejected',
        icon: <RejectedIcon />,
        label: 'Rejected',
        count: counts?.Rejected ?? 0,
      },
    ];
  }, [counts]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState({});
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const { data } = useMembersList({ authToken, accessLevel: getAccessLevel(filter as string) });
  const { table } = useMembersTable({
    members: data?.data,
    sorting,
    setSorting,
    rowSelection,
    setRowSelection,
    authToken,
    pagination,
    setPagination,
  });

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Members</span>

          <span className={s.filters}>
            <TableFilter
              items={items}
              active={filter as string}
              onFilterClick={(id) =>
                router.replace({
                  query: {
                    filter: id,
                  },
                })
              }
            >
              <button className={s.addNewBtn}>
                <AddIcon /> Add new
              </button>
            </TableFilter>
          </span>
        </div>

        <div className={s.body}>
          <div className={s.table}>
            {/* Header */}
            {table.getHeaderGroups().map((headerGroup) => (
              <div key={headerGroup.id} className={s.tableRow}>
                {headerGroup.headers.map((header, i) => {
                  return header.isPlaceholder ? null : (
                    <div
                      className={clsx(s.headerCell, {
                        [s.first]: i === 0,
                        [s.last]: i === headerGroup.headers.length - 1,
                        [s.sortable]: header.column.getCanSort(),
                        [s.fixed]: !!header.column.columnDef.size,
                        [s.flexible]: !header.column.columnDef.size,
                      })}
                      style={{
                        width: header.column.getSize(),
                        flexBasis: header.column.getSize(),
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        justifyContent: header.column.columnDef.meta?.align === 'center' ? 'center' : 'flex-start',
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                      title={
                        header.column.getCanSort()
                          ? header.column.getNextSortingOrder() === 'asc'
                            ? 'Sort ascending'
                            : header.column.getNextSortingOrder() === 'desc'
                            ? 'Sort descending'
                            : 'Clear sort'
                          : undefined
                      }
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <SortIcon />}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Body */}
            {table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <div key={row.id} className={s.tableRow}>
                  {row.getVisibleCells().map((cell) => (
                    <div
                      className={clsx(s.bodyCell, {
                        [s.fixed]: !!cell.column.columnDef.size,
                        [s.flexible]: !cell.column.columnDef.size,
                      })}
                      style={{
                        width: cell.column.getSize(),
                        flexBasis: cell.column.getSize(),
                      }}
                      key={cell.id}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>

                {/* Expanded content */}
                {row.getIsExpanded() && (
                  <div className={s.tableRow}>
                    <div className="bg-gray-50 p-4">
                      <strong>Details:</strong> This is expanded content for {row.original.name}
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <MultieditControls
            ids={Object.keys(rowSelection)}
            onReset={() => setRowSelection({})}
            authToken={authToken}
          />
          <div className="flex items-center gap-2">
            <button
              className="rounded border p-1"
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {'<<'}
            </button>
            <button
              className="rounded border p-1"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {'<'}
            </button>
            <button className="rounded border p-1" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              {'>'}
            </button>
            <button className="rounded border p-1" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()}>
              {'>>'}
            </button>
            <span className="flex items-center gap-1">
              <div>Page</div>
              <strong>
                {table.getState().pagination.pageIndex + 1} of {table.getPageCount().toLocaleString()}
              </strong>
            </span>
            <span className="flex items-center gap-1">
              | Go to page:
              <input
                type="number"
                min="1"
                max={table.getPageCount()}
                defaultValue={table.getState().pagination.pageIndex + 1}
                onChange={(e) => {
                  const page = e.target.value ? Number(e.target.value) - 1 : 0;
                  table.setPageIndex(page);
                }}
                className="w-16 rounded border p-1"
              />
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
            >
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  Show {pageSize}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default MembersPage;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { plnadmin } = parseCookies(context);
  try {
    if (!plnadmin) {
      const currentUrl = context.resolvedUrl;
      const loginUrl = `/?backlink=${currentUrl}`;
      return {
        redirect: {
          destination: loginUrl,
          permanent: false,
        },
      };
    }

    return {
      props: {
        authToken: plnadmin,
      },
    };
  } catch (error) {
    return {
      props: {
        authToken: '',
        isError: true,
      },
    };
  }
};

function getAccessLevel(filter: string | undefined) {
  switch (filter) {
    case 'level1':
      return ['L1'];
    case 'level2':
      return ['L2', 'L3', 'L4'];
    case 'level0':
      return ['L0'];
    case 'rejected':
    default:
      return ['Rejected'];
  }
}

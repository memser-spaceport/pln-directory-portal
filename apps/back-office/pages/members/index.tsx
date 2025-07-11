import React, { useEffect, useMemo, useState } from 'react';

import s from './styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { TableFilter } from '../../components/filters/TableFilter/TableFilter';
import { useRouter } from 'next/router';
import { ColumnFiltersState, flexRender, PaginationState, SortingState } from '@tanstack/react-table';
import { useMembersTable } from '../../screens/members/hooks/useMembersTable';
import { useMembersList } from '../../hooks/members/useMembersList';
import { Level0Icon, Level1Icon, Level2Icon, RejectedIcon, SortIcon } from '../../screens/members/components/icons';
import clsx from 'clsx';
import { MultieditControls } from '../../screens/members/components/MultieditControls';
import { useAccessLevelCounts } from '../../hooks/members/useAccessLevelCounts';
import PaginationControls from '../../screens/members/components/PaginationControls/PaginationControls';
import { AddMember } from '../../screens/members/components/AddMember/AddMember';
import { useCookie } from 'react-use';
import { StatusFilter } from '../../screens/members/components/StatusFilter';

const MembersPage = () => {
  const router = useRouter();
  const query = router.query;
  const { filter, search } = query;
  const [authToken] = useCookie('plnadmin');
  const { data: counts } = useAccessLevelCounts({ authToken });
  const items = useMemo(() => {
    return [
      {
        id: 'level1',
        icon: <Level1Icon />,
        label: 'L1',
        count: counts?.L1 ?? 0,
        activeColor: '#4174FF',
      },
      {
        id: 'level2',
        icon: <Level2Icon />,
        label: 'L2-L4',
        count: (counts?.L2 ?? 0) + (counts?.L3 ?? 0) + (counts?.L4 ?? 0),
        activeColor: '#0A9952',
      },
      {
        id: 'level0',
        icon: <Level0Icon />,
        label: 'L0',
        count: counts?.L0 ?? 0,
        activeColor: '#D97706',
      },
      {
        id: 'rejected',
        icon: <RejectedIcon />,
        label: 'Rejected',
        count: counts?.Rejected ?? 0,
        activeColor: '#D21A0E',
      },
    ];
  }, [counts]);
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'accessLevel',
      desc: true,
    },
  ]);
  const [rowSelection, setRowSelection] = React.useState({});
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [globalFilter, setGlobalFilter] = useState<string>((search as string | undefined) ?? '');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
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
    globalFilter,
    setGlobalFilter,
    columnFilters,
    setColumnFilters,
  });

  useEffect(() => {
    if (!authToken) {
      router.push(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (search) {
      setGlobalFilter(search as string);
    }
  }, [search]);

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Members</span>

          <span className={s.filters}>
            <input
              value={globalFilter}
              onChange={(e) => table.setGlobalFilter(String(e.target.value))}
              placeholder="Filter by name or email"
              className={clsx(s.input)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  table.setGlobalFilter('');
                }
              }}
            />
            <TableFilter
              items={items}
              active={filter as string}
              onFilterClick={(id) => {
                setColumnFilters([]);
                router.replace({
                  query: {
                    filter: id,
                  },
                });
              }}
            >
              <AddMember className={s.addNewBtn} authToken={authToken} />
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

                      {header.column.id === 'accessLevel' && filter === 'level2' && (
                        <div
                          className="ml-auto"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <StatusFilter
                            onSelect={(v) => {
                              header.column.setFilterValue(v || undefined);
                            }}
                            value={columnFilters}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Body */}
            {table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <div key={row.id} className={s.tableRow}>
                  {row.getVisibleCells().map((cell, i) => (
                    <div
                      className={clsx(s.bodyCell, {
                        [s.first]: i === 0,
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
          <PaginationControls table={table} />
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default MembersPage;

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

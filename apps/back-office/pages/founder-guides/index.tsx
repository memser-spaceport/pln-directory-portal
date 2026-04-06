import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { flexRender, PaginationState, SortingState, Table } from '@tanstack/react-table';
import { useCookie } from 'react-use';
import clsx from 'clsx';

import s from '../deals/styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { SortIcon } from '../../screens/members/components/icons';
import PaginationControls from '../../screens/members/components/PaginationControls/PaginationControls';

import { useArticleRequestsList } from '../../hooks/founder-guides/useArticleRequestsList';
import { useGuideRequestsTable } from '../../screens/founder-guides/hooks/useGuideRequestsTable';

type Tab = 'requests';

const FounderGuidesPage = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const tab = (router.query.tab as Tab | undefined) ?? 'requests';

  const [requestsSorting, setRequestsSorting] = useState<SortingState>([{ id: 'requestedDate', desc: true }]);
  const [requestsPagination, setRequestsPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [requestsFilter, setRequestsFilter] = useState('');

  const { data: requestsPayload } = useArticleRequestsList({ authToken });

  const { table: requestsTable } = useGuideRequestsTable({
    requests: requestsPayload?.items,
    sorting: requestsSorting,
    setSorting: setRequestsSorting,
    pagination: requestsPagination,
    setPagination: setRequestsPagination,
    globalFilter: requestsFilter,
    setGlobalFilter: setRequestsFilter,
  });

  useEffect(() => {
    setRequestsPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [requestsFilter]);

  useEffect(() => {
    if (!authToken) {
      router.push(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  if (!isLoading && user && !isDirectoryAdmin) {
    return null;
  }

  const setTab = (t: Tab) => {
    router.replace({ query: { tab: t } }, undefined, { shallow: true });
  };

  const columnSizeStyle = (size: number) => (size > 0 ? { width: size, flexBasis: size } : undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTable = (activeTable: Table<any>, noTopBorder = false) => (
    <div className={clsx(s.table, { [s.tableWithControlBar]: noTopBorder })}>
      {activeTable.getHeaderGroups().map((headerGroup) => (
        <div key={headerGroup.id} className={s.tableRow}>
          {headerGroup.headers.map((header, i) =>
            header.isPlaceholder ? null : (
              <div
                key={header.id}
                className={clsx(s.headerCell, {
                  [s.first]: i === 0,
                  [s.sortable]: header.column.getCanSort(),
                  [s.fixed]: !!header.column.columnDef.size,
                  [s.flexible]: !header.column.columnDef.size,
                })}
                style={{
                  ...columnSizeStyle(header.column.getSize()),
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  justifyContent: header.column.columnDef.meta?.align === 'center' ? 'center' : 'flex-start',
                }}
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getCanSort() && <SortIcon />}
              </div>
            )
          )}
        </div>
      ))}

      {activeTable.getRowModel().rows.length === 0 ? (
        <div className={s.emptyState}>No records found.</div>
      ) : (
        activeTable.getRowModel().rows.map((row) => (
          <div key={row.id} className={s.tableRow}>
            {row.getVisibleCells().map((cell, i) => (
              <div
                key={cell.id}
                className={clsx(s.bodyCell, {
                  [s.first]: i === 0,
                  [s.fixed]: !!cell.column.columnDef.size,
                  [s.flexible]: !cell.column.columnDef.size,
                })}
                style={{
                  ...columnSizeStyle(cell.column.getSize()),
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  justifyContent: cell.column.columnDef.meta?.align === 'center' ? 'center' : 'flex-start',
                }}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Guides</span>
          <p className={s.subtitle}>Review requests for new or updated founder guide content.</p>
        </div>

        <div className={s.tabs}>
          <button className={clsx(s.tab, { [s.active]: tab === 'requests' })} onClick={() => setTab('requests')}>
            Guide Requests
            <span className={clsx(s.tabCount, { [s.active]: tab === 'requests' })}>{requestsPayload?.total ?? 0}</span>
          </button>
        </div>

        <div className={s.body}>
          {tab === 'requests' && (
            <>
              <div className={s.controlBar}>
                <input
                  value={requestsFilter}
                  onChange={(e) => setRequestsFilter(e.target.value)}
                  placeholder="Search guides"
                  className={s.searchInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setRequestsFilter('');
                  }}
                />
                <select className={s.filterSelect} disabled>
                  <option value="">All statuses</option>
                </select>
              </div>
              {renderTable(requestsTable, true)}
              <PaginationControls table={requestsTable} />
            </>
          )}
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default FounderGuidesPage;

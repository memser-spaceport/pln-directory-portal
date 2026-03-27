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
import { IssueStatus, ReportedIssue } from '../types/deal';
import { IssueActionMenu } from '../components/IssueActionMenu/IssueActionMenu';

const columnHelper = createColumnHelper<ReportedIssue>();

function VendorAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase() || '?';
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: '#f1f5f9',
        border: '1px solid rgba(203,213,225,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 600,
        color: '#455468',
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

function ReporterAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase() || '?';
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: '#f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 600,
        color: '#455468',
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const isOpen = status === 'OPEN';
  return (
    <span
      style={{
        color: isOpen ? '#ea580c' : '#059669',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {isOpen ? 'Open' : 'Resolved'}
    </span>
  );
}

type UseReportedIssuesTableArgs = {
  issues: ReportedIssue[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
  onStatusChange: (uid: string, status: IssueStatus) => void;
  onView: (issue: ReportedIssue) => void;
  onDeactivateDeal: (dealUid: string) => void;
};

export function useReportedIssuesTable({
  issues,
  sorting,
  setSorting,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
  onStatusChange,
  onView,
  onDeactivateDeal,
}: UseReportedIssuesTableArgs) {
  const columns = useMemo(
    () => [
      // 1. Vendor & Deal
      columnHelper.display({
        id: 'vendorDeal',
        header: 'Vendor & Deal',
        size: 0,
        cell: (info) => {
          const { deal } = info.row.original;
          return (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <VendorAvatar name={deal.vendorName} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: '#455468' }}>{deal.vendorName}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 200,
                  }}
                >
                  {/* shortDescription not on the nested deal — show category as subtitle */}
                  {deal.category}
                </div>
              </div>
            </div>
          );
        },
      }),
      // 2. Reported By
      columnHelper.display({
        id: 'reportedBy',
        header: 'Reported By',
        size: 240,
        cell: (info) => {
          const { authorMember } = info.row.original;
          return (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {authorMember.image?.url ? (
                <img
                  src={authorMember.image?.url}
                  alt={authorMember?.name}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <ReporterAvatar name={authorMember.name} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: '#455468' }}>{authorMember.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{authorMember.email}</div>
              </div>
            </div>
          );
        },
      }),
      // 3. Issue summary
      columnHelper.accessor('description', {
        header: 'Issue summary',
        cell: (info) => (
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 340,
              fontSize: 14,
              color: '#455468',
            }}
          >
            {info.getValue()}
          </div>
        ),
        size: 0,
        enableSorting: false,
      }),
      // 4. Date Reported
      columnHelper.accessor('createdAt', {
        header: 'Date Reported',
        sortingFn: 'datetime',
        enableSorting: true,
        size: 140,
        cell: (info) => {
          const d = new Date(info.getValue());
          return (
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#455468' }}>
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase()}
              </div>
            </div>
          );
        },
      }),
      // 5. Status
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <IssueStatusBadge status={info.getValue()} />,
        size: 100,
        enableSorting: true,
      }),
      // 6. Action
      columnHelper.display({
        id: 'actions',
        header: 'Action',
        cell: (info) => (
          <IssueActionMenu
            issue={info.row.original}
            onStatusChange={onStatusChange}
            onView={onView}
            onDeactivateDeal={onDeactivateDeal}
          />
        ),
        size: 80,
        enableResizing: false,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        meta: { align: 'center' },
      }),
    ],
    [onStatusChange, onView, onDeactivateDeal]
  );

  const data = useMemo(() => issues ?? [], [issues]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
      globalFilter,
    },
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.uid,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = (filterValue as string).toLowerCase();
      const issue = row.original;
      return (
        issue.deal.vendorName.toLowerCase().includes(q) ||
        issue.deal.category.toLowerCase().includes(q) ||
        issue.authorMember.name.toLowerCase().includes(q) ||
        issue.authorMember.email.toLowerCase().includes(q) ||
        issue.description.toLowerCase().includes(q)
      );
    },
  });

  return { table };
}

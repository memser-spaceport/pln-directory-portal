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
import { SubmittedDeal } from '../types/deal';
import s from '../../../pages/deals/styles.module.scss';

const columnHelper = createColumnHelper<SubmittedDeal>();

// 40×40 rounded-square avatar with vendor initial
function VendorAvatar({ name }: { name: string }) {
  const initial = name?.charAt(0).toUpperCase() || '?';
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: '#f1f5f9',
        border: '1px solid rgba(27,56,96,0.24)',
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

// 40×40 circular avatar with submitter initial
function SubmitterAvatar({ name }: { name: string }) {
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

type UseSubmittedDealsTableArgs = {
  deals: SubmittedDeal[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
  onReview: (deal: SubmittedDeal) => void;
};

export function useSubmittedDealsTable({
  deals,
  sorting,
  setSorting,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
  onReview,
}: UseSubmittedDealsTableArgs) {
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'vendorDeal',
        header: 'Vendor & Deal',
        size: 0,
        cell: (info) => {
          const { vendorName, shortDescription, logo } = info.row.original;
          return (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {logo?.url ? (
                <img
                  src={logo.url}
                  alt={vendorName}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    objectFit: 'contain',
                    border: '1px solid rgba(27,56,96,0.24)',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <VendorAvatar name={vendorName} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: '#455468' }}>{vendorName}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 300,
                  }}
                >
                  {shortDescription}
                </div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'submittedBy',
        header: 'Submitted By',
        size: 272,
        cell: (info) => {
          const { authorMember } = info.row.original;
          return (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <SubmitterAvatar name={authorMember.name} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, color: '#455468' }}>{authorMember.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{authorMember.email}</div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('createdAt', {
        header: 'Submission Date',
        sortingFn: 'datetime',
        enableSorting: true,
        size: 160,
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
      columnHelper.display({
        id: 'action',
        header: 'Action',
        size: 140,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        meta: { align: 'center' },
        cell: (info) => (
          <button className={s.reviewBtn} onClick={() => onReview(info.row.original)}>
            Review Deal
          </button>
        ),
      }),
    ],
    [onReview]
  );

  const data = useMemo(() => deals ?? [], [deals]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
      globalFilter,
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase();
      const { vendorName, shortDescription, authorMember } = row.original;
      return (
        vendorName?.toLowerCase().includes(search) ||
        shortDescription?.toLowerCase().includes(search) ||
        authorMember?.name?.toLowerCase().includes(search) ||
        authorMember?.email?.toLowerCase().includes(search)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.uid,
  });

  return { table };
}

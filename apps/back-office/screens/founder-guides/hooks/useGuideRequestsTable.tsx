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
import type { GuideArticleRequest } from '../types/guide-request';

const columnHelper = createColumnHelper<GuideArticleRequest>();

function RequesterAvatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const initial = name?.charAt(0).toUpperCase() || '?';
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

function guideLabel(row: GuideArticleRequest) {
  return row.article?.title ?? row.title;
}

type UseGuideRequestsTableArgs = {
  requests: GuideArticleRequest[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
};

export function useGuideRequestsTable({
  requests,
  sorting,
  setSorting,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
}: UseGuideRequestsTableArgs) {
  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.requestedByUser.name, {
        id: 'requestedBy',
        header: 'Requested by',
        size: 280,
        enableSorting: true,
        sortingFn: 'alphanumeric',
        cell: (info) => {
          const { name, email, image } = info.row.original.requestedByUser;
          return (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <RequesterAvatar name={name} imageUrl={image?.url} />
              <div>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: 14,
                    color: '#455468',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                  }}
                >
                  {name}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {email}
                </div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => guideLabel(row), {
        id: 'guideTitle',
        header: 'Requested guide',
        size: 280,
        enableSorting: true,
        sortingFn: 'alphanumeric',
        cell: (info) => (
          <div style={{ fontWeight: 500, fontSize: 14, color: '#455468', whiteSpace: 'normal' }}>
            {info.getValue() ?? '—'}
          </div>
        ),
      }),
      columnHelper.accessor('description', {
        header: 'Details',
        size: 0,
        cell: (info) => {
          const raw = info.getValue() ?? '';
          const text = raw.replace(/<[^>]*>/g, '').trim();
          return (
            <div
              style={{
                fontSize: 14,
                color: '#455468',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {text || '—'}
            </div>
          );
        },
      }),
      columnHelper.accessor('requestedDate', {
        header: 'Date submitted',
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
    ],
    []
  );

  const data = useMemo(() => requests ?? [], [requests]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, globalFilter },
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase();
      const r = row.original;
      const label = guideLabel(r);
      const desc = (r.description ?? '').replace(/<[^>]*>/g, '').toLowerCase();
      return (
        r.requestedByUser.name?.toLowerCase().includes(search) ||
        r.requestedByUser.email?.toLowerCase().includes(search) ||
        label.toLowerCase().includes(search) ||
        r.article?.category?.toLowerCase().includes(search) ||
        desc.includes(search)
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

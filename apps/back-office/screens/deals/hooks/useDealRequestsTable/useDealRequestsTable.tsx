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
import DOMPurify from 'isomorphic-dompurify';

import { DealRequest } from '../../types/deal';

import s from './useDealRequestsTable.module.scss';

const columnHelper = createColumnHelper<DealRequest>();

function RequesterAvatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={s.avatarImage} />;
  }
  const initial = name?.charAt(0).toUpperCase() || '?';
  return <div className={s.avatarFallback}>{initial}</div>;
}

type UseDealRequestsTableArgs = {
  requests: DealRequest[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
};

export function useDealRequestsTable(input: UseDealRequestsTableArgs) {
  const { requests, sorting, setSorting, pagination, setPagination, globalFilter, setGlobalFilter } = input;

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.requestedByUser.name, {
        id: 'requestedBy',
        header: 'Requested by',
        size: 272,
        enableSorting: true,
        sortingFn: 'alphanumeric',
        cell: (info) => {
          const { name, email, image } = info.row.original.requestedByUser;
          return (
            <div className={s.requesterCell}>
              <RequesterAvatar name={name} imageUrl={image?.url} />
              <div>
                <div className={s.requesterName}>{name}</div>
                <div className={s.requesterEmail}>{email}</div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('whatDealAreYouLookingFor', {
        id: 'requestedDeal',
        header: 'Requested Deal',
        size: 200,
        enableSorting: true,
        sortingFn: 'alphanumeric',
        cell: (info) => <div className={s.requestedDeal}>{info.getValue() ?? '—'}</div>,
      }),
      columnHelper.accessor('description', {
        header: 'Reason',
        size: 0,
        cell: (info) => {
          const raw = info.getValue() ?? '';

          const clean = DOMPurify.sanitize(raw, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'],
            ALLOWED_ATTR: ['href', 'rel', 'target'],
          });

          return <div className={s.reason} dangerouslySetInnerHTML={{ __html: clean }} />;
        },
      }),
      columnHelper.accessor('createdAt', {
        header: 'Date Submitted',
        sortingFn: 'datetime',
        enableSorting: true,
        size: 160,
        cell: (info) => {
          const d = new Date(info.getValue());
          return (
            <div>
              <div className={s.dateMain}>
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div className={s.dateTime}>
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
      const { requestedByUser, deal } = row.original;
      return (
        requestedByUser.name?.toLowerCase().includes(search) ||
        requestedByUser.email?.toLowerCase().includes(search) ||
        deal?.vendorName?.toLowerCase().includes(search)
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

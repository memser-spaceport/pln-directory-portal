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
import { Row } from '@tanstack/table-core/src/types';

import { Policy } from '../../../hooks/access-control/usePoliciesList';
import PolicyNameCell from '../components/PolicyNameCell/PolicyNameCell';
import ModulesCell from '../components/ModulesCell/ModulesCell';

const columnHelper = createColumnHelper<Policy>();

type UsePoliciesTableArgs = {
  policies: Policy[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
};

export function usePoliciesTable({
  policies,
  sorting,
  setSorting,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
}: UsePoliciesTableArgs) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Policy',
        sortingFn: 'alphanumeric',
        cell: (info) => <PolicyNameCell policy={info.row.original} />,
        size: 0,
      }),
      columnHelper.accessor('role', {
        header: 'Role',
        cell: (info) => <span>{info.getValue() ?? '–'}</span>,
        size: 160,
        enableSorting: false,
      }),
      columnHelper.accessor('group', {
        header: 'Group',
        cell: (info) => {
          const val = info.getValue();
          if (!val) return <span style={{ color: '#94a3b8' }}>–</span>;
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 9999,
                background: '#f1f5f9',
                fontSize: 12,
                fontWeight: 500,
                color: '#334155',
              }}
            >
              {val}
            </span>
          );
        },
        size: 140,
        enableSorting: false,
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => <span style={{ color: '#64748b' }}>{info.getValue() ?? '–'}</span>,
        size: 0,
        enableSorting: false,
      }),
      columnHelper.display({
        id: 'modules',
        header: 'Modules',
        cell: (info) => <ModulesCell policy={info.row.original} />,
        size: 220,
        enableResizing: false,
        enableSorting: false,
      }),
      columnHelper.display({
        id: 'members',
        header: 'Members',
        cell: () => <span style={{ color: '#94a3b8' }}>–</span>,
        size: 88,
        enableResizing: false,
        enableSorting: false,
      }),
      columnHelper.display({
        id: 'action',
        header: 'Action',
        cell: () => (
          <button
            disabled
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              background: '#fff',
              fontSize: 14,
              fontWeight: 500,
              color: '#334155',
              cursor: 'not-allowed',
              opacity: 0.5,
            }}
          >
            View
          </button>
        ),
        size: 88,
        enableResizing: false,
        enableSorting: false,
      }),
    ],
    []
  );

  const customFilterFn = (row: Row<Policy>, _columnId: string, filterValue: string) => {
    const v = filterValue?.toLowerCase() ?? '';
    if (!v) return true;
    return (
      (row.original.name?.toLowerCase().includes(v) ||
        row.original.role?.toLowerCase().includes(v) ||
        row.original.group?.toLowerCase().includes(v)) ??
      false
    );
  };

  const table = useReactTable({
    data: policies ?? [],
    columns,
    state: { sorting, pagination, globalFilter },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: customFilterFn,
    getRowId: (row) => row.uid,
  });

  return { table };
}

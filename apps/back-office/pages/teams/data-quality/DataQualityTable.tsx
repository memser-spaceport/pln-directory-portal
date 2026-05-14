import React, { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { clsx } from 'clsx';

import { EnrichmentTeam } from '../../../hooks/teams/useTeamsEnrichmentReview';
import { WEB_UI_BASE_URL } from '../../../utils/constants';
import PaginationControls from '../../../screens/members/components/PaginationControls/PaginationControls';
import { FieldStatusCell } from './FieldStatusCell';
import { TeamLogoCell } from './TeamLogoCell';
import { FIELD_KEYS, FIELD_LABELS } from './constants';
import s from '../data-quality.module.scss';

interface Props {
  teams: EnrichmentTeam[];
  isLoading: boolean;
  search: string;
  evalFilter: 'all' | 'low' | 'high';
  sourceFilter: 'all' | 'enriched' | 'user';
  onEdit: (team: EnrichmentTeam) => void;
}

const columnHelper = createColumnHelper<EnrichmentTeam>();

// Sort value for a field column cell:
//   0 = Low (needs attention — first when ascending)
//   1 = High (good)
//   2 = no entry (last when ascending)
function fieldSortValue(team: EnrichmentTeam, key: typeof FIELD_KEYS[number]): number {
  const entry = key === 'logo' ? team.logo : team.fields[key];
  if (!entry) return 2;
  return (entry.judgment?.score ?? 0) >= 50 ? 1 : 0;
}

export function DataQualityTable({ teams, isLoading, search, evalFilter, sourceFilter, onEdit }: Props) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [search, evalFilter, sourceFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Team',
        size: 180,
        maxSize: 180,
        sortingFn: 'alphanumeric',
        cell: (info) => {
          const team = info.row.original;
          return (
            <a href={`${WEB_UI_BASE_URL}/teams/${team.uid}`} target="_blank" rel="noreferrer" className={s.teamLink}>
              <TeamLogoCell logo={team.logo} name={team.name} />
              <span className={s.teamName}>{team.name}</span>
            </a>
          );
        },
      }),
      ...FIELD_KEYS.map((key) =>
        // Use accessor (not display) so getCanSort() sees an accessorFn and allows sorting
        columnHelper.accessor((row) => fieldSortValue(row, key), {
          id: key,
          header: FIELD_LABELS[key],
          sortingFn: 'basic',
          cell: (info) => {
            const team = info.row.original;
            const entry = key === 'logo' ? team.logo : team.fields[key];
            return entry ? <FieldStatusCell entry={entry} /> : <span className={s.emptyField}>—</span>;
          },
        })
      ),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: (info) => (
          <button className={s.reviewButton} onClick={() => onEdit(info.row.original)}>
            Edit
          </button>
        ),
      }),
    ],
    [onEdit]
  );

  const table = useReactTable({
    data: teams,
    columns,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
    getRowId: (row) => row.uid,
  });

  const colCount = FIELD_KEYS.length + 2;

  return (
    <div className={s.tableSection}>
      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header, i) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={clsx(s.th, i === 0 && s.stickyCol, i === 0 && s.teamNameCell, canSort && s.thSortable)}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className={s.thContent}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className={s.sortIcon}>
                            {sorted === 'asc' ? <SortAscIcon /> : sorted === 'desc' ? <SortDescIcon /> : <SortNeutralIcon />}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={colCount} className={s.stateCell}>Loading…</td>
              </tr>
            )}
            {!isLoading && teams.length === 0 && (
              <tr>
                <td colSpan={colCount} className={s.stateCell}>
                  {search || evalFilter !== 'all' || sourceFilter !== 'all'
                    ? 'No teams match your filters.'
                    : 'No teams with reviewable fields found.'}
                </td>
              </tr>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={s.tr}>
                  {row.getVisibleCells().map((cell, i) => (
                    <td key={cell.id} className={clsx(s.td, i === 0 && s.stickyCol, i === 0 && s.teamNameCell)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!isLoading && teams.length > 0 && <PaginationControls table={table} />}
    </div>
  );
}

const SortNeutralIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 3l3 4H5l3-4zM8 13l-3-4h6l-3 4z" fill="currentColor" opacity="0.35" />
  </svg>
);

const SortAscIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 3l3 4H5l3-4z" fill="currentColor" />
    <path d="M8 13l-3-4h6l-3 4z" fill="currentColor" opacity="0.35" />
  </svg>
);

const SortDescIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 3l3 4H5l3-4z" fill="currentColor" opacity="0.35" />
    <path d="M8 13l-3-4h6l-3 4z" fill="currentColor" />
  </svg>
);

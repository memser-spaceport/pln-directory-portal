import React, { useMemo, useState } from 'react';
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
import { TeamLogoCell } from './TeamLogoCell';
import { FIELD_KEYS, FIELD_LABELS, UNJUDGED_SCORE, getEntry, isAIEnriched } from './constants';
import s from '../../../pages/teams/data-quality.module.scss';

interface Props {
  teams: EnrichmentTeam[];
  isLoading: boolean;
  hasActiveFilters: boolean;
  onEdit: (team: EnrichmentTeam) => void;
}

const columnHelper = createColumnHelper<EnrichmentTeam>();

function formatDate(iso: string | null): { main: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  return {
    main: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function DataQualityTable({ teams, isLoading, hasActiveFilters, onEdit }: Props) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('priority', {
        id: 'priority',
        header: 'Priority',
        size: 90,
        sortingFn: 'basic',
        cell: (info) => <span className={s.priorityPill}>P{info.getValue()}</span>,
      }),
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Team',
        size: 220,
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
      columnHelper.display({
        id: 'needsReview',
        header: 'Needs Review',
        enableSorting: false,
        cell: (info) => {
          const team = info.row.original;
          const chips = FIELD_KEYS.flatMap((key) => {
            const entry = getEntry(team, key);
            if (!entry) return [];
            if ((entry.judgment?.score ?? UNJUDGED_SCORE) >= 50) return [];
            return [
              <span key={key} className={clsx(s.reviewChip, isAIEnriched(entry) ? s.reviewChipAI : s.reviewChipUser)}>
                {FIELD_LABELS[key]}
              </span>,
            ];
          });
          return chips.length > 0 ? <div className={s.reviewChips}>{chips}</div> : null;
        },
      }),
      columnHelper.accessor('judgedAt', {
        id: 'judgedAt',
        header: 'Last Judged',
        sortingFn: 'datetime',
        cell: (info) => {
          const date = formatDate(info.getValue());
          if (!date) return <span className={s.emptyField}>—</span>;
          return (
            <div className={s.dateStack}>
              <span className={s.dateMain}>{date.main}</span>
              <span className={s.dateTime}>{date.time}</span>
            </div>
          );
        },
      }),
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

  const colCount = 5;

  return (
    <div className={s.tableSection}>
      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={clsx(s.th, canSort && s.thSortable)}
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
                  {hasActiveFilters ? 'No teams match your filters.' : 'No teams with low-quality fields found.'}
                </td>
              </tr>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={s.tr}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={s.td}>
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

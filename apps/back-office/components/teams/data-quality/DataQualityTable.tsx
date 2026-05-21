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
        size: 300,
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
            if ((entry.judgment?.score ?? UNJUDGED_SCORE) > 90) return [];
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
        size: 160,
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
        size: 100,
        enableSorting: false,
        cell: (info) => (
          <button className={s.reviewButton} onClick={() => onEdit(info.row.original)}>
            <EditIcon /> Edit
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
    autoResetPageIndex: false,
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
                      style={header.id !== 'needsReview' ? { width: header.getSize() } : undefined}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className={s.thContent}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className={s.sortIcon}>
                            {sorted === 'asc' ? (
                              <SortAscIcon />
                            ) : sorted === 'desc' ? (
                              <SortDescIcon />
                            ) : (
                              <SortNeutralIcon />
                            )}
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
                <td colSpan={colCount} className={s.stateCell}>
                  Loading…
                </td>
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

const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12.8789 1.35156L13.3984 1.87109C14 2.47266 14 3.42969 13.3984 4.03125L12.5781 4.85156L9.89844 2.17188L10.7188 1.35156C11.3203 0.75 12.2773 0.75 12.8789 1.35156ZM4.70312 7.36719L9.26953 2.80078L11.9492 5.48047L7.38281 10.0469C7.21875 10.2109 7 10.3477 6.78125 10.4297L4.34766 11.2227C4.12891 11.3047 3.85547 11.25 3.69141 11.0586C3.5 10.8945 3.44531 10.6211 3.52734 10.4023L4.32031 7.96875C4.40234 7.75 4.53906 7.53125 4.70312 7.36719ZM2.625 2.5H5.25C5.71484 2.5 6.125 2.91016 6.125 3.375C6.125 3.86719 5.71484 4.25 5.25 4.25H2.625C2.13281 4.25 1.75 4.66016 1.75 5.125V12.125C1.75 12.6172 2.13281 13 2.625 13H9.625C10.0898 13 10.5 12.6172 10.5 12.125V9.5C10.5 9.03516 10.8828 8.625 11.375 8.625C11.8398 8.625 12.25 9.03516 12.25 9.5V12.125C12.25 13.5742 11.0742 14.75 9.625 14.75H2.625C1.17578 14.75 0 13.5742 0 12.125V5.125C0 3.67578 1.17578 2.5 2.625 2.5Z"
      fill="#64748B"
    />
  </svg>
);

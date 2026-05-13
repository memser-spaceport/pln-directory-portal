import React, { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  PaginationState,
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

export function DataQualityTable({ teams, isLoading, search, evalFilter, sourceFilter, onEdit }: Props) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  // Reset to first page whenever filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [search, evalFilter, sourceFilter]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'name',
        header: 'Team',
        cell: (info) => {
          const team = info.row.original;
          return (
            <a
              href={`${WEB_UI_BASE_URL}/teams/${team.uid}`}
              target="_blank"
              rel="noreferrer"
              className={s.teamLink}
            >
              <TeamLogoCell logo={team.logo} name={team.name} />
              <span className={s.teamName}>{team.name}</span>
            </a>
          );
        },
      }),
      ...FIELD_KEYS.map((key) =>
        columnHelper.display({
          id: key,
          header: FIELD_LABELS[key],
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
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
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
                {hg.headers.map((header, i) => (
                  <th
                    key={header.id}
                    className={clsx(s.th, i === 0 && s.stickyCol, i === 0 && s.teamNameCell)}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
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
            {!isLoading && table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={s.tr}>
                {row.getVisibleCells().map((cell, i) => (
                  <td
                    key={cell.id}
                    className={clsx(s.td, i === 0 && s.stickyCol, i === 0 && s.teamNameCell)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isLoading && teams.length > 0 && (
        <PaginationControls table={table} />
      )}
    </div>
  );
}

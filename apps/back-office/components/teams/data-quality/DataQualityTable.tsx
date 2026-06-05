import React, { useCallback, useMemo, useRef, useState } from 'react';
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

import { EnrichmentTeam, FieldKey, LogoEntry } from '../../../hooks/teams/useTeamsEnrichmentReview';
import { useApproveEnrichmentFields } from '../../../hooks/teams/useApproveEnrichmentFields';
import { WEB_UI_BASE_URL } from '../../../utils/constants';
import PaginationControls from '../../../screens/members/components/PaginationControls/PaginationControls';
import { TeamLogoCell } from './TeamLogoCell';
import { NeedsReviewCell } from './NeedsReviewCell';
import { FIELD_KEYS, needsReview } from './constants';
import s from '../../../pages/teams/data-quality.module.scss';

interface Props {
  teams: EnrichmentTeam[];
  isLoading: boolean;
  hasActiveFilters: boolean;
  authToken: string | null | undefined;
  onEdit: (team: EnrichmentTeam) => void;
}

const columnHelper = createColumnHelper<EnrichmentTeam>();
const emptySet = new Set<FieldKey>();

function formatDate(iso: string | null): { main: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  return {
    main: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function DataQualityTable({ teams, isLoading, hasActiveFilters, authToken, onEdit }: Props) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);

  // Optimistic confirmed-fields state: teamUid → Set<FieldKey>
  const [confirmedFields, setConfirmedFields] = useState<Map<string, Set<FieldKey>>>(new Map());
  // Teams with an in-flight mutation — disables all confirm/apply for that team
  const [pendingTeams, setPendingTeams] = useState<Set<string>>(new Set());

  const { mutateAsync: approveFields } = useApproveEnrichmentFields();

  // Use a ref so callbacks below don't need the mutation in their dependency arrays
  const approveFieldsRef = useRef(approveFields);
  approveFieldsRef.current = approveFields;

  const addConfirmed = useCallback((teamUid: string, keys: FieldKey[]) => {
    setConfirmedFields((prev) => {
      const next = new Map(prev);
      const existing = new Set(next.get(teamUid));
      keys.forEach((k) => existing.add(k));
      next.set(teamUid, existing);
      return next;
    });
  }, []);

  const removeConfirmed = useCallback((teamUid: string, keys: FieldKey[]) => {
    setConfirmedFields((prev) => {
      const next = new Map(prev);
      const existing = new Set(next.get(teamUid));
      keys.forEach((k) => existing.delete(k));
      next.set(teamUid, existing);
      return next;
    });
  }, []);

  const handleConfirmField = useCallback(
    async (teamUid: string, key: FieldKey, content?: string) => {
      if (!authToken) return;
      addConfirmed(teamUid, [key]);
      setPendingTeams((prev) => new Set(prev).add(teamUid));
      try {
        await approveFieldsRef.current({ authToken, teamUid, fields: [{ key, content }] });
      } catch {
        removeConfirmed(teamUid, [key]);
      } finally {
        setPendingTeams((prev) => {
          const s = new Set(prev);
          s.delete(teamUid);
          return s;
        });
      }
    },
    [authToken, addConfirmed, removeConfirmed]
  );

  const handleConfirmAll = useCallback(
    async (teamUid: string, keys: FieldKey[]) => {
      if (!authToken || keys.length === 0) return;
      addConfirmed(teamUid, keys);
      setPendingTeams((prev) => new Set(prev).add(teamUid));
      try {
        await approveFieldsRef.current({ authToken, teamUid, fields: keys.map((key) => ({ key })) });
      } catch {
        removeConfirmed(teamUid, keys);
      } finally {
        setPendingTeams((prev) => {
          const s = new Set(prev);
          s.delete(teamUid);
          return s;
        });
      }
    },
    [authToken, addConfirmed, removeConfirmed]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('priority', {
        id: 'priority',
        header: 'Priority',
        size: 90,
        sortingFn: 'basic',
        cell: (info) => (
          <span className={s.priorityPill}>{info.getValue() === 99 ? `N/A` : `P${info.getValue()}`}</span>
        ),
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
              <TeamLogoCell logo={team.logo ?? (team.fields?.logo as LogoEntry)} name={team.name} />
              <span className={s.teamName}>{team.name}</span>
            </a>
          );
        },
      }),
      columnHelper.accessor('judgedAt', {
        id: 'judgedAt',
        header: 'Last Enrichment',
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
        id: 'needsReview',
        header: 'Needs Review',
        enableSorting: false,
        cell: (info) => {
          const team = info.row.original;
          return (
            <NeedsReviewCell
              team={team}
              confirmedKeys={confirmedFields.get(team.uid) ?? emptySet}
              isPending={pendingTeams.has(team.uid)}
              onConfirm={(key) => handleConfirmField(team.uid, key)}
              onApply={(key, content) => handleConfirmField(team.uid, key, content)}
              onEdit={onEdit}
            />
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 200,
        enableSorting: false,
        cell: (info) => {
          const team = info.row.original;
          const teamConfirmed = confirmedFields.get(team.uid) ?? emptySet;
          const lowKeys = FIELD_KEYS.filter(
            (key) => needsReview(team, key) && !teamConfirmed.has(key)
          );
          const isPending = pendingTeams.has(team.uid);
          const allConfirmed = lowKeys.length === 0;

          return (
            <div className={s.actionsCell}>
              {allConfirmed ? (
                <span className={s.allConfirmedBadge}>
                  <CheckIcon /> Confirmed
                </span>
              ) : (
                <button
                  type="button"
                  className={s.confirmAllBtn}
                  disabled={isPending}
                  onClick={() => handleConfirmAll(team.uid, lowKeys)}
                  aria-label={`Confirm all fields for ${team.name}`}
                >
                  {isPending ? <SpinnerIcon /> : <CheckIcon />}
                  Confirm all
                </button>
              )}
              <button type="button" className={s.editRowBtn} onClick={() => onEdit(team)}>
                <PencilIcon /> Edit
              </button>
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onEdit, confirmedFields, pendingTeams, handleConfirmField, handleConfirmAll]
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
                  const isPriority = header.id === 'priority';
                  const isTeam = header.id === 'name';
                  return (
                    <th
                      key={header.id}
                      className={clsx(
                        s.th,
                        canSort && s.thSortable,
                        isPriority && s.stickyPriority,
                        isTeam && s.stickyTeam
                      )}
                      style={
                        header.id !== 'needsReview'
                          ? { width: header.getSize() }
                          : undefined
                      }
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
                  {row.getVisibleCells().map((cell) => {
                    const isP = cell.column.id === 'priority';
                    const isT = cell.column.id === 'name';
                    const isNR = cell.column.id === 'needsReview';
                    return (
                      <td
                        key={cell.id}
                        className={clsx(
                          s.td,
                          isP && s.stickyPriority,
                          isT && s.stickyTeam,
                          isNR && s.tdTop
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
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

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96A16,16,0,0,0,227.31,73.37ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
  </svg>
);

const SpinnerIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    aria-hidden="true"
    style={{ animation: 'spin 0.8s linear infinite' }}
  >
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

import React, { useEffect, useMemo, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import Select, { StylesConfig } from 'react-select';

import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { useTeamsEnrichmentReview, EnrichmentTeam } from '../../hooks/teams/useTeamsEnrichmentReview';
import { FIELD_KEYS, getEntry, isAIEnriched, needsReview } from '../../components/teams/data-quality/constants';
import { DataQualityTable } from '../../components/teams/data-quality/DataQualityTable';
import { EditModal } from '../../components/teams/data-quality/EditModal';
import s from './data-quality.module.scss';

type SelectOption = { label: string; value: string };

const selectStyles: StylesConfig<SelectOption> = {
  container: (base) => ({ ...base, minWidth: 160 }),
  control: (base) => ({
    ...base,
    height: 48,
    borderRadius: '8px',
    border: '1px solid rgba(203, 213, 225, 0.50)',
    background: '#fff',
    fontSize: '14px',
    boxShadow: 'none',
    borderColor: 'rgba(203, 213, 225, 0.50)',
    '&:hover': { borderColor: '#5E718D', boxShadow: '0 0 0 4px rgba(27, 56, 96, 0.12)' },
  }),
  indicatorSeparator: () => ({ display: 'none' }),
  option: (base, state) => ({
    ...base,
    fontSize: '14px',
    color: state.isSelected ? '#fff' : '#455468',
    '&:hover': { background: 'rgba(27, 56, 96, 0.12)', color: '#455468' },
  }),
  menu: (base) => ({ ...base, zIndex: 3 }),
};

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All priorities' },
  { value: '1', label: 'P1' },
  { value: '2', label: 'P2' },
  { value: '3', label: 'P3' },
  { value: '4', label: 'P4' },
  { value: '5', label: 'P5' },
];

const SOURCE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'Any source' },
  { value: 'ai', label: 'Has AI-enriched fields' },
  { value: 'user', label: 'Has user-provided fields' },
];

const DataQualityPage: React.FC = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<number | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ai' | 'user'>('all');
  const [selectedTeam, setSelectedTeam] = useState<EnrichmentTeam | null>(null);

  const { data: teams = [], isLoading: teamsLoading, isError } = useTeamsEnrichmentReview(authToken);

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) router.replace('/access-denied');
  }, [isLoading, user, isDirectoryAdmin, router]);

  useEffect(() => {
    if (isError) toast.error('Failed to load teams. Please try again.');
  }, [isError]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();

    return teams.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;

      // Only show teams with at least one field still pending admin review
      // (not auto-approved at verdict=agrees + confidence=high — same rule the API applies).
      if (!FIELD_KEYS.some((key) => needsReview(t, key))) return false;

      // Priority
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;

      // Source
      if (sourceFilter !== 'all') {
        const hasSource = FIELD_KEYS.some((key) => {
          const entry = getEntry(t, key);
          if (!entry) return false;
          return sourceFilter === 'ai' ? isAIEnriched(entry) : entry.metadata.status === 'ChangedByUser';
        });
        if (!hasSource) return false;
      }

      return true;
    });
  }, [teams, search, priorityFilter, sourceFilter]);

  const hasActiveFilters = search.trim() !== '' || priorityFilter !== 'all' || sourceFilter !== 'all';

  if (!isLoading && user && !isDirectoryAdmin) return null;

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Teams — Data Quality</span>
          <div className={s.headerActions}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by team name…"
              className={s.input}
            />
            <Select<SelectOption>
              menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
              options={PRIORITY_OPTIONS}
              value={PRIORITY_OPTIONS.find(
                (o) => o.value === (priorityFilter === 'all' ? 'all' : String(priorityFilter))
              )}
              onChange={(opt) => setPriorityFilter(opt?.value === 'all' ? 'all' : Number(opt?.value))}
              isClearable={false}
              styles={selectStyles}
            />
            <Select<SelectOption>
              menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
              options={SOURCE_OPTIONS}
              value={SOURCE_OPTIONS.find((o) => o.value === sourceFilter)}
              onChange={(opt) => setSourceFilter((opt?.value ?? 'all') as typeof sourceFilter)}
              isClearable={false}
              styles={selectStyles}
            />
          </div>
        </div>

        <DataQualityTable
          teams={filteredTeams}
          isLoading={teamsLoading}
          hasActiveFilters={hasActiveFilters}
          onEdit={setSelectedTeam}
        />

        <EditModal team={selectedTeam} authToken={authToken} onClose={() => setSelectedTeam(null)} />
      </div>
    </ApprovalLayout>
  );
};

export default DataQualityPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const cookies = parseCookies(ctx);
  if (!cookies['plnadmin']) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  return { props: {} };
};

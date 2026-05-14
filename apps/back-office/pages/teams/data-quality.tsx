import React, { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import Select, { StylesConfig } from 'react-select';

import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { useTeamsEnrichmentReview, EnrichmentTeam } from '../../hooks/teams/useTeamsEnrichmentReview';
import { FIELD_KEYS } from './data-quality/constants';
import { DataQualityTable } from './data-quality/DataQualityTable';
import { EditModal } from './data-quality/EditModal';
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

const EVAL_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All scores' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
];

const SOURCE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All sources' },
  { value: 'enriched', label: 'Enriched' },
  { value: 'user', label: 'Provided by user' },
];


const DataQualityPage: React.FC = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [search, setSearch] = useState('');
  const [evalFilter, setEvalFilter] = useState<'all' | 'low' | 'high'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'enriched' | 'user'>('all');
  const [selectedTeam, setSelectedTeam] = useState<EnrichmentTeam | null>(null);

  const { data: teams = [], isLoading: teamsLoading, isError } = useTeamsEnrichmentReview(authToken);

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) router.replace('/access-denied');
  }, [isLoading, user, isDirectoryAdmin, router]);

  useEffect(() => {
    if (isError) toast.error('Failed to load teams. Please try again.');
  }, [isError]);

  const filteredTeams = teams.filter((t) => {
    const q = search.trim().toLowerCase();
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (evalFilter === 'all' && sourceFilter === 'all') return true;

    return FIELD_KEYS.some((key) => {
      const entry = key === 'logo' ? t.logo : t.fields[key];
      if (!entry) return false;
      const isHigh = (entry.judgment?.score ?? 0) >= 50;
      const isEnriched = entry.promotable;
      const evalMatch = evalFilter === 'all' || (evalFilter === 'high' ? isHigh : !isHigh);
      const sourceMatch = sourceFilter === 'all' || (sourceFilter === 'enriched' ? isEnriched : !isEnriched);
      return evalMatch && sourceMatch;
    });
  });

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
              options={EVAL_OPTIONS}
              value={EVAL_OPTIONS.find((o) => o.value === evalFilter)}
              onChange={(opt: SelectOption | null) => setEvalFilter((opt?.value ?? 'all') as typeof evalFilter)}
              isClearable={false}
              styles={selectStyles}
            />
            <Select<SelectOption>
              menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
              options={SOURCE_OPTIONS}
              value={SOURCE_OPTIONS.find((o) => o.value === sourceFilter)}
              onChange={(opt: SelectOption | null) => setSourceFilter((opt?.value ?? 'all') as typeof sourceFilter)}
              isClearable={false}
              styles={selectStyles}
            />
          </div>
        </div>

        <DataQualityTable
          teams={filteredTeams}
          isLoading={teamsLoading}
          search={search}
          evalFilter={evalFilter}
          sourceFilter={sourceFilter}
          onEdit={setSelectedTeam}
        />

        <EditModal team={selectedTeam} authToken={authToken} onClose={() => setSelectedTeam(null)} />
      </div>
    </ApprovalLayout>
  );
};

export default DataQualityPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { plnadmin } = parseCookies(ctx);
  if (!plnadmin) {
    return {
      redirect: {
        destination: `/?backlink=${ctx.resolvedUrl}`,
        permanent: false,
      },
    };
  }
  return { props: {} };
};

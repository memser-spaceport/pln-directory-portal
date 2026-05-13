import React, { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { clsx } from 'clsx';

import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { WEB_UI_BASE_URL } from '../../utils/constants';
import { useTeamsEnrichmentReview, EnrichmentTeam } from '../../hooks/teams/useTeamsEnrichmentReview';
import { useTriggerEnrichment } from '../../hooks/teams/useTriggerEnrichment';
import { FIELD_KEYS, FIELD_LABELS } from './data-quality/constants';
import { TeamLogoCell } from './data-quality/TeamLogoCell';
import { EditModal } from './data-quality/EditModal';
import s from './data-quality.module.scss';

const DataQualityPage: React.FC = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [search, setSearch] = useState('');
  const [evalFilter, setEvalFilter] = useState<'all' | 'low' | 'high'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'enriched' | 'user'>('all');
  const [selectedTeam, setSelectedTeam] = useState<EnrichmentTeam | null>(null);

  const { data: teams = [], isLoading: teamsLoading, isError } = useTeamsEnrichmentReview(authToken);
  const triggerMutation = useTriggerEnrichment();

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
            <select
              className={s.filterSelect}
              value={evalFilter}
              onChange={(e) => setEvalFilter(e.target.value as typeof evalFilter)}
            >
              <option value="all">All scores</option>
              <option value="low">Low</option>
              <option value="high">High</option>
            </select>
            <select
              className={s.filterSelect}
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
            >
              <option value="all">All sources</option>
              <option value="enriched">Enriched</option>
              <option value="user">Provided by user</option>
            </select>
            <button
              className={s.triggerBtn}
              disabled={triggerMutation.isPending}
              onClick={() =>
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                triggerMutation.mutate(authToken!, {
                  onSuccess: (res) => toast.success(res.message ?? 'Enrichment triggered.'),
                  onError: () => toast.error('Failed to trigger enrichment.'),
                })
              }
            >
              {triggerMutation.isPending ? 'Triggering…' : 'Trigger Enrichment'}
            </button>
          </div>
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={clsx(s.th, s.stickyCol)}>Team</th>
                {FIELD_KEYS.map((key) => (
                  <th key={key} className={s.th}>{FIELD_LABELS[key]}</th>
                ))}
                <th className={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teamsLoading && (
                <tr>
                  <td colSpan={FIELD_KEYS.length + 2} className={s.stateCell}>Loading…</td>
                </tr>
              )}
              {!teamsLoading && filteredTeams.length === 0 && (
                <tr>
                  <td colSpan={FIELD_KEYS.length + 2} className={s.stateCell}>
                    {search ? 'No teams match your search.' : 'No teams with reviewable fields found.'}
                  </td>
                </tr>
              )}
              {!teamsLoading && filteredTeams.map((team) => (
                <tr key={team.uid} className={s.tr}>
                  <td className={clsx(s.td, s.stickyCol, s.teamNameCell)}>
                    <a
                      href={`${WEB_UI_BASE_URL}/teams/${team.uid}`}
                      target="_blank"
                      rel="noreferrer"
                      className={s.teamLink}
                    >
                      <TeamLogoCell logo={team.logo} name={team.name} />
                      <span className={s.teamName}>{team.name}</span>
                    </a>
                  </td>
                  {FIELD_KEYS.map((key) => {
                    const entry = key === 'logo' ? team.logo : team.fields[key];
                    return (
                      <td key={key} className={s.td}>
                        {entry ? (
                          <div className={s.fieldCell}>
                            <span className={s.dataSource}>
                              {entry.promotable ? 'Enriched' : 'Provided by user'}
                            </span>
                            <span className={clsx(
                              s.evalBadge,
                              (entry.judgment?.score ?? 0) >= 50 ? s.evalHigh : s.evalLow
                            )}>
                              {(entry.judgment?.score ?? 0) >= 50 ? 'High' : 'Low'}
                            </span>
                          </div>
                        ) : (
                          <span className={s.emptyField}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={s.td}>
                    <button className={s.reviewButton} onClick={() => setSelectedTeam(team)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <EditModal
          team={selectedTeam}
          authToken={authToken}
          onClose={() => setSelectedTeam(null)}
        />
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

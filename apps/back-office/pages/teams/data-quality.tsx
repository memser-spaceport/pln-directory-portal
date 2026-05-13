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
import { useTeamsEnrichmentReview, EnrichmentTeam, FieldKey } from '../../hooks/teams/useTeamsEnrichmentReview';
import { useApproveEnrichmentFields } from '../../hooks/teams/useApproveEnrichmentFields';
import { FIELD_KEYS, FIELD_LABELS } from './data-quality/constants';
import { TeamLogoCell } from './data-quality/TeamLogoCell';
import { ReviewModal } from './data-quality/ReviewModal';
import s from './data-quality.module.scss';

const DataQualityPage: React.FC = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<EnrichmentTeam | null>(null);
  const [approved, setApproved] = useState<Record<string, boolean>>({});

  const { data: teams = [], isLoading: teamsLoading, isError } = useTeamsEnrichmentReview(authToken);
  const approveMutation = useApproveEnrichmentFields();

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) router.replace('/access-denied');
  }, [isLoading, user, isDirectoryAdmin, router]);

  useEffect(() => {
    setApproved({});
  }, [selectedTeam?.uid]);

  useEffect(() => {
    if (isError) toast.error('Failed to load teams. Please try again.');
  }, [isError]);

  const handleApproveField = (teamUid: string, fieldKey: FieldKey) => {
    const stateKey = `${teamUid}:${fieldKey}`;
    if (approved[stateKey] || approveMutation.isPending) return;

    approveMutation.mutate(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      { authToken: authToken!, teamUid, fields: [fieldKey] },
      {
        onSuccess: () => setApproved((prev) => ({ ...prev, [stateKey]: true })),
        onError: () => toast.error(`Failed to approve ${FIELD_LABELS[fieldKey]}. Please try again.`),
      }
    );
  };

  const filteredTeams = teams.filter((t) => {
    const q = search.trim().toLowerCase();
    return !q || t.name.toLowerCase().includes(q);
  });

  if (!isLoading && user && !isDirectoryAdmin) return null;

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Teams — Data Quality</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by team name…"
            className={s.input}
          />
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
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ReviewModal
          team={selectedTeam}
          approved={approved}
          isSaving={approveMutation.isPending}
          onClose={() => setSelectedTeam(null)}
          onApproveField={handleApproveField}
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

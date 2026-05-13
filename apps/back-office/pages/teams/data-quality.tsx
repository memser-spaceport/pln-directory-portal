import React, { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { clsx } from 'clsx';

import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { WEB_UI_BASE_URL } from '../../utils/constants';
import { useTeamsEnrichmentReview, FieldKey, FieldEntry, LogoEntry, EnrichmentTeam } from '../../hooks/teams/useTeamsEnrichmentReview';
import { useApproveEnrichmentFields } from '../../hooks/teams/useApproveEnrichmentFields';
import s from './data-quality.module.scss';

const FIELD_KEYS: FieldKey[] = [
  'website',
  'logo',
  'shortDescription',
  'longDescription',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'blog',
];

const FIELD_LABELS: Record<FieldKey, string> = {
  website: 'Website',
  logo: 'Logo',
  shortDescription: 'Short Description',
  longDescription: 'Long Description',
  contactMethod: 'Contact Method',
  twitterHandler: 'Twitter',
  linkedinHandler: 'LinkedIn',
  blog: 'Blog',
};

function formatFieldContent(content: FieldEntry['content']): string {
  if (content === null || content === undefined) return '';
  if (Array.isArray(content)) return content.join(', ');
  if (typeof content === 'object' && 'url' in content) return content.url ?? '';
  const str = String(content);
  return str.length > 100 ? str.slice(0, 100) + '…' : str;
}

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
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/access-denied');
    }
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
                  <th key={key} className={s.th}>
                    {FIELD_LABELS[key]}
                  </th>
                ))}
                <th className={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teamsLoading && (
                <tr>
                  <td colSpan={FIELD_KEYS.length + 2} className={s.stateCell}>
                    Loading…
                  </td>
                </tr>
              )}
              {!teamsLoading && filteredTeams.length === 0 && (
                <tr>
                  <td colSpan={FIELD_KEYS.length + 2} className={s.stateCell}>
                    {search ? 'No teams match your search.' : 'No teams with reviewable fields found.'}
                  </td>
                </tr>
              )}
              {!teamsLoading &&
                filteredTeams.map((team) => (
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
                              <span
                                className={clsx(
                                  s.evalBadge,
                                  (entry.judgment?.score ?? 0) >= 50 ? s.evalHigh : s.evalLow
                                )}
                              >
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

        <AnimatePresence>
          {selectedTeam && (
            <motion.div
              className={s.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTeam(null)}
            >
              <motion.div
                className={s.modal}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={s.modalHeader}>
                  <h2 className={s.modalTitle}>{selectedTeam.name} — Enrichment Review</h2>
                  <button className={s.closeButton} onClick={() => setSelectedTeam(null)}>
                    ✕
                  </button>
                </div>

                <div className={s.modalBody}>
                  {FIELD_KEYS.map((key) => {
                    const entry = key === 'logo' ? selectedTeam.logo : selectedTeam.fields[key];
                    if (!entry) return null;
                    const stateKey = `${selectedTeam.uid}:${key}`;
                    const isApproved = !!approved[stateKey];
                    const isSaving = approveMutation.isPending;
                    const isUserOwned = !entry.promotable;

                    return (
                      <div key={key} className={clsx(s.fieldRow, { [s.fieldRowApproved]: isApproved })}>
                        <div className={s.fieldInfo}>
                          <div className={s.fieldMeta}>
                            <span className={s.fieldLabel}>{FIELD_LABELS[key]}</span>
                            <span className={clsx(s.badge, entry.promotable ? s.badgeAI : s.badgeUser)}>
                              {entry.promotable ? 'AI' : 'User'}
                            </span>
                          </div>
                          <span className={s.fieldValue}>{formatFieldContent(entry.content)}</span>
                          {entry.judgment?.note && (
                            <span className={s.judgmentNote}>
                              AI note: {entry.judgment.note}
                              {entry.judgment.score !== undefined && ` (score: ${entry.judgment.score})`}
                            </span>
                          )}
                        </div>
                        <div className={s.toggleWrapper}>
                          <button
                            className={clsx(s.toggle, {
                              [s.toggleOn]: isApproved,
                              [s.toggleDisabled]: isApproved || isSaving || isUserOwned,
                            })}
                            disabled={isApproved || isSaving || isUserOwned}
                            onClick={() => handleApproveField(selectedTeam.uid, key)}
                            title={isUserOwned ? 'User-owned field — cannot be overridden' : undefined}
                          >
                            <span className={s.toggleThumb} />
                          </button>
                          <span className={s.toggleStatus}>
                            {isApproved ? 'Approved' : isSaving ? 'Saving…' : isUserOwned ? 'User-owned' : 'Approve'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ApprovalLayout>
  );
};

export default DataQualityPage;

function TeamLogoCell({ logo, name }: { logo?: LogoEntry; name: string }) {
  const url =
    logo?.content && typeof logo.content === 'object' && 'url' in logo.content ? logo.content.url : null;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={s.teamLogo}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return <span className={s.teamLogoPlaceholder}>{name.charAt(0).toUpperCase()}</span>;
}

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

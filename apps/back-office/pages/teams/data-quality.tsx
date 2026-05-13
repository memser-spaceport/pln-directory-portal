import React, { useCallback, useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';
import { clsx } from 'clsx';

import { ApprovalLayout } from '../../layout/approval-layout';
import api from '../../utils/api';
import { useAuth } from '../../context/auth-context';
import { WEB_UI_BASE_URL } from '../../utils/constants';
import s from './data-quality.module.scss';

type FieldKey =
  | 'website'
  | 'logo'
  | 'shortDescription'
  | 'longDescription'
  | 'contactMethod'
  | 'twitterHandler'
  | 'linkedinHandler'
  | 'blog';

type FieldEntry = {
  content: string | string[] | { uid: string; url: string } | null;
  metadata: { source?: string; lastModifiedAt?: string };
  judgment?: { note?: string; score?: number };
  promotable: boolean;
};

type LogoEntry = FieldEntry & {
  verification: { verdict: string; confidence: string; reason: string } | null;
};

type EnrichmentTeam = {
  uid: string;
  name: string;
  enrichmentStatus: string;
  fields: Partial<Record<FieldKey, FieldEntry>>;
  logo?: LogoEntry;
};

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

  const [teams, setTeams] = useState<EnrichmentTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<EnrichmentTeam | null>(null);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [approving, setApproving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/access-denied');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    setApproved({});
    setApproving({});
  }, [selectedTeam?.uid]);

  async function loadTeams() {
    try {
      setLoading(true);
      const cookies = parseCookies();
      const config = { headers: { authorization: `Bearer ${cookies.plnadmin}` } };
      const res = await api.get('/v1/admin/teams/enrichment-review?pageSize=200', config);
      setTeams(res.data?.teams ?? []);
    } catch (e) {
      console.error('Failed to load enrichment data', e);
      toast.error('Failed to load teams. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const handleApproveField = useCallback(
    async (teamUid: string, fieldKey: FieldKey) => {
      const stateKey = `${teamUid}:${fieldKey}`;
      if (approved[stateKey] || approving[stateKey]) return;

      try {
        setApproving((prev) => ({ ...prev, [stateKey]: true }));
        const cookies = parseCookies();
        const config = { headers: { authorization: `Bearer ${cookies.plnadmin}` } };
        await api.patch(`/v1/admin/teams/${teamUid}/enrichment-review/fields`, { fields: [fieldKey] }, config);
        setApproved((prev) => ({ ...prev, [stateKey]: true }));
      } catch (e) {
        console.error('Failed to approve field', e);
        toast.error(`Failed to approve ${FIELD_LABELS[fieldKey]}. Please try again.`);
      } finally {
        setApproving((prev) => ({ ...prev, [stateKey]: false }));
      }
    },
    [approved, approving]
  );

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
              {loading && (
                <tr>
                  <td colSpan={FIELD_KEYS.length + 2} className={s.stateCell}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filteredTeams.length === 0 && (
                <tr>
                  <td colSpan={FIELD_KEYS.length + 2} className={s.stateCell}>
                    {search ? 'No teams match your search.' : 'No teams with reviewable fields found.'}
                  </td>
                </tr>
              )}
              {!loading &&
                filteredTeams.map((team) => (
                  <tr key={team.uid} className={s.tr}>
                    <td className={clsx(s.td, s.stickyCol, s.teamNameCell)}>
                      <a
                        href={`${WEB_UI_BASE_URL}/teams/${team.uid}`}
                        target="_blank"
                        rel="noreferrer"
                        className={s.teamLink}
                      >
                        {team.logo?.content && typeof team.logo.content === 'object' && 'url' in team.logo.content ? (
                          <img
                            src={team.logo.content.url}
                            alt={team.name}
                            className={s.teamLogo}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <span className={s.teamLogoPlaceholder}>{team.name.charAt(0).toUpperCase()}</span>
                        )}
                        <span className={s.teamName}>{team.name}</span>
                      </a>
                    </td>
                    {FIELD_KEYS.map((key) => {
                      const entry = key === 'logo' ? team.logo : team.fields[key];
                      return (
                        <td key={key} className={s.td}>
                          {entry ? (
                            <div className={s.fieldCell}>
                              <WarningIcon />
                              <span className={clsx(s.badge, entry.promotable ? s.badgeAI : s.badgeUser)}>
                                {entry.promotable ? 'AI' : 'User'}
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
                    const isApproving = !!approving[stateKey];
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
                              [s.toggleDisabled]: isApproved || isApproving || isUserOwned,
                            })}
                            disabled={isApproved || isApproving || isUserOwned}
                            onClick={() => handleApproveField(selectedTeam.uid, key)}
                            title={isUserOwned ? 'User-owned field — cannot be overridden' : undefined}
                          >
                            <span className={s.toggleThumb} />
                          </button>
                          <span className={s.toggleStatus}>
                            {isApproved ? 'Approved' : isApproving ? 'Saving…' : isUserOwned ? 'User-owned' : 'Approve'}
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

const WarningIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 9a1 1 0 01-1-1V7a1 1 0 012 0v3a1 1 0 01-1 1zm0 3a1 1 0 110-2 1 1 0 010 2z"
      fill="#F59E0B"
    />
  </svg>
);

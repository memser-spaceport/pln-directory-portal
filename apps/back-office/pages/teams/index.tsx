/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';

import { ApprovalLayout } from '../../layout/approval-layout';
import api from '../../utils/api';
import s from './styles.module.scss';
import clsx from 'clsx';
import { CloseIcon } from '../../screens/members/components/icons';
import { TeamAccessLevelSelect } from './components/TeamAccessLevelSelect';

// Access levels we allow to set for teams
type AccessLevel = 'L0' | 'L1';

type TeamRow = {
  uid: string;
  name: string;
  accessLevel: AccessLevel;
  plnFriend: boolean;
  isFund: boolean;
  website?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  tier: number | null; // make it always present (null if not set)
  createdAt: string;
  updatedAt: string;
};

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const TeamsPage: React.FC = () => {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Access-level saving state
  const [savingUid, setSavingUid] = useState<string | null>(null);

  // Search state
  const [search, setSearch] = useState('');

  // Right-side editor state
  const [selectedTeamUid, setSelectedTeamUid] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TeamRow>>({});
  const [savingTeam, setSavingTeam] = useState(false);

  // Load teams on mount
  useEffect(() => {
    loadTeams();
  }, []);

  /**
   * Loads all teams from the admin endpoint.
   * Uses the same backend as before: GET /v1/admin/teams
   */
  async function loadTeams() {
    try {
      setLoading(true);
      const cookies = parseCookies();
      const config = {
        headers: { authorization: `Bearer ${cookies.plnadmin}` },
      };
      const res = await api.get('/v1/admin/teams', config);
      const rawTeams: any[] = res.data?.teams ?? [];

      // Normalise tier to number | null, to avoid "undefined" issues
      const data: TeamRow[] = rawTeams.map((t) => ({
        ...t,
        tier: t.tier === undefined || t.tier === null || t.tier === '' ? null : Number(t.tier),
      }));

      setTeams(data);
    } catch (e) {
      console.error('Failed to load teams', e);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Updates access level for a single team.
   * PATCH /v1/teams/:uid/access-level { accessLevel }
   */
  async function updateAccessLevel(teamUid: string, accessLevel: AccessLevel) {
    if (!accessLevel) return;

    const teamName = teams.find((t) => t.uid === teamUid)?.name || 'Team';

    try {
      setSavingUid(teamUid);
      const cookies = parseCookies();
      const config = {
        headers: { authorization: `Bearer ${cookies.plnadmin}` },
      };

      await api.patch(`/v1/teams/${teamUid}/access-level`, { accessLevel }, config);

      toast.success(`Successfully updated access level for ${teamName} to ${accessLevel}`);

      // Optimistic UI update
      setTeams((prev) => prev.map((t) => (t.uid === teamUid ? { ...t, accessLevel } : t)));
    } catch (e) {
      console.error('Failed to update access level', e);
      toast.error(`Failed to update access level for ${teamName}`);
    } finally {
      setSavingUid(null);
    }
  }

  /**
   * Opens the right-hand editor panel for the given team.
   */
  function openEditor(team: TeamRow) {
    setSelectedTeamUid(team.uid);
    setEditForm({
      uid: team.uid,
      name: team.name,
      website: team.website ?? '',
      shortDescription: team.shortDescription ?? '',
      longDescription: team.longDescription ?? '',
      plnFriend: team.plnFriend,
      // keep tier as number | null; if null — input will be empty
      tier: team.tier,
    });
  }

  function closeEditor() {
    setSelectedTeamUid(null);
    setEditForm({});
  }

  /**
   * Generic change handler for editor fields.
   */
  function onFieldChange<K extends keyof TeamRow>(field: K, value: TeamRow[K]) {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  /**
   * Saves the team using the "legacy" style payload:
   * {
   *   participantType: "TEAM",
   *   requesterEmailId: "...",
   *   uniqueIdentifier: name,
   *   newData: { ...fields... }
   * }
   *
   * Endpoint:
   * PATCH /v1/admin/teams/:uid/full
   *
   * Backend reuses updateTeamFromParticipantsRequest under the hood.
   */
  async function saveTeam() {
    if (!selectedTeamUid) return;

    try {
      setSavingTeam(true);
      const cookies = parseCookies();
      const config = {
        headers: { authorization: `Bearer ${cookies.plnadmin}` },
      };

      const name = (editForm.name ?? '').toString().trim();

      const tierValue = editForm.tier === undefined || editForm.tier === null ? null : Number(editForm.tier);

      const newData: any = {
        name,
        website: editForm.website ?? '',
        shortDescription: editForm.shortDescription ?? '',
        longDescription: editForm.longDescription ?? '',
        plnFriend: !!editForm.plnFriend,
        // isFund is intentionally NOT editable on the right panel now
      };

      // Only send tier when user set it explicitly;
      // if null — backend may treat as "clear" or ignore, depending on mapping.
      if (tierValue !== null) {
        newData.tier = tierValue;
      }

      const payload = {
        participantType: 'TEAM',
        requesterEmailId: 'backoffice@plnetwork.io',
        uniqueIdentifier: name || selectedTeamUid,
        newData,
      };

      await api.patch(`/v1/admin/teams/${selectedTeamUid}/full`, payload, config);

      // Optimistic local update (including tier)
      setTeams((prev) =>
        prev.map((t) =>
          t.uid === selectedTeamUid
            ? {
                ...t,
                name: newData.name ?? t.name,
                website: newData.website !== undefined ? newData.website : t.website,
                shortDescription:
                  newData.shortDescription !== undefined ? newData.shortDescription : t.shortDescription,
                longDescription: newData.longDescription !== undefined ? newData.longDescription : t.longDescription,
                plnFriend: newData.plnFriend !== undefined ? newData.plnFriend : t.plnFriend,
                tier: tierValue !== null ? tierValue : t.tier, // if no tier sent, keep previous value
              }
            : t
        )
      );

      closeEditor();
    } catch (e) {
      console.error('Failed to save team', e);
    } finally {
      setSavingTeam(false);
    }
  }

  const filteredTeams = teams.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || (t.website ?? '').toLowerCase().includes(q);
  });

  const selectedTeam = teams.find((t) => t.uid === selectedTeamUid) || null;

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Teams</span>
          <span className={s.filters}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by team name..."
              className={s.input}
            />
          </span>
        </div>

        <div className={s.body}>
          <div className={s.table}>
            {/* Header */}
            <div className={clsx(s.tableRow, s.tableHeader)}>
              <div className={clsx(s.headerCell, s.first, s.teamNameColumn)}>Team</div>
              <div className={clsx(s.headerCell, s.accessLevelColumn)}>Access level</div>
              <div className={clsx(s.headerCell, s.booleanColumn)}>PLN friend</div>
              <div className={clsx(s.headerCell, s.booleanColumn)}>Is fund</div>
              <div className={clsx(s.headerCell, s.dateColumn)}>Created</div>
              <div className={clsx(s.headerCell, s.dateColumn)}>Updated</div>
              <div className={clsx(s.headerCell, s.infoColumn)}>Info</div>
            </div>

            {/* Body */}
            {loading && <div className={s.loading}>Loading teams…</div>}

            {!loading && filteredTeams.length === 0 && <div className={s.emptyState}>No teams found</div>}

            {!loading &&
              filteredTeams.map((team) => (
                <div
                  key={team.uid}
                  className={s.tableRow}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openEditor(team)}
                >
                  <div className={clsx(s.bodyCell, s.first, s.teamNameColumn)}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 500, color: 'var(--foreground-neutral-primary, #0A0C11)' }}>
                        {team.name}
                      </span>
                      {team.website && (
                        <span style={{ fontSize: '12px', color: 'var(--foreground-neutral-secondary, #455468)' }}>
                          {team.website}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={clsx(s.bodyCell, s.accessLevelColumn)} onClick={(e) => e.stopPropagation()}>
                    <TeamAccessLevelSelect
                      value={team.accessLevel ?? 'L0'}
                      onChange={(val) => updateAccessLevel(team.uid, val)}
                      disabled={savingUid === team.uid}
                    />
                  </div>

                  <div className={clsx(s.bodyCell, s.booleanColumn)}>{team.plnFriend ? 'Yes' : 'No'}</div>
                  <div className={clsx(s.bodyCell, s.booleanColumn)}>{team.isFund ? 'Yes' : 'No'}</div>
                  <div className={clsx(s.bodyCell, s.dateColumn)}>{new Date(team.createdAt).toLocaleDateString()}</div>
                  <div className={clsx(s.bodyCell, s.dateColumn)}>{new Date(team.updatedAt).toLocaleDateString()}</div>

                  <div className={clsx(s.bodyCell, s.infoColumn)} onClick={(e) => e.stopPropagation()}>
                    <button className={s.editButton} onClick={() => openEditor(team)}>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M4 13.5L4.5 11L11.5 4L14 6.5L7 13.5L4 13.5Z"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M10.5 4L13 6.5"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Edit
                    </button>
                  </div>
                </div>
              ))}
          </div>

          {/* Modal editor panel */}
          <AnimatePresence>
            {selectedTeamUid && selectedTeam && (
              <motion.div className={s.modal} initial="hidden" animate="visible" exit="exit" variants={fade}>
                <div className={s.modalContent}>
                  <div className={s.modalHeader}>
                    <h2 className={s.modalTitle}>Edit team</h2>
                    {selectedTeam.website && <p className={s.modalSubtitle}>{selectedTeam.website}</p>}
                    <button className={s.closeButton} onClick={closeEditor}>
                      <CloseIcon />
                    </button>
                  </div>

                  <div className={s.formFields}>
                    <div className={s.formField}>
                      <label className={s.formLabel}>Name</label>
                      <input
                        className={s.formInput}
                        value={editForm.name ?? ''}
                        onChange={(e) => onFieldChange('name', e.target.value as any)}
                      />
                    </div>

                    <div className={s.formField}>
                      <label className={s.formLabel}>Website</label>
                      <input
                        className={s.formInput}
                        value={editForm.website ?? ''}
                        onChange={(e) => onFieldChange('website', e.target.value as any)}
                      />
                    </div>

                    <div className={s.formField}>
                      <label className={s.formLabel}>Short description</label>
                      <textarea
                        className={s.formTextarea}
                        style={{ minHeight: '60px' }}
                        value={editForm.shortDescription ?? ''}
                        onChange={(e) => onFieldChange('shortDescription', e.target.value as any)}
                      />
                    </div>

                    <div className={s.formField}>
                      <label className={s.formLabel}>Long description</label>
                      <textarea
                        className={s.formTextarea}
                        style={{ minHeight: '80px' }}
                        value={editForm.longDescription ?? ''}
                        onChange={(e) => onFieldChange('longDescription', e.target.value as any)}
                      />
                    </div>

                    <div className={s.formField}>
                      <div className={s.checkboxContainer}>
                        <input
                          type="checkbox"
                          className={s.checkbox}
                          checked={!!editForm.plnFriend}
                          onChange={(e) => onFieldChange('plnFriend', e.target.checked as any)}
                        />
                        <label className={s.checkboxLabel}>PLN friend</label>
                      </div>
                    </div>

                    <div className={s.formField}>
                      <label className={s.formLabel}>Tier</label>
                      <input
                        type="number"
                        min={0}
                        max={4}
                        className={s.formInput}
                        value={editForm.tier === null || editForm.tier === undefined ? '' : String(editForm.tier)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            onFieldChange('tier', null as any);
                          } else {
                            const num = Number(raw);
                            onFieldChange('tier', (isNaN(num) ? null : num) as any);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className={s.actionButtons}>
                    <button className={s.cancelButton} onClick={closeEditor}>
                      Cancel
                    </button>
                    <button className={s.saveButton} disabled={savingTeam} onClick={saveTeam}>
                      {savingTeam ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default TeamsPage;

/**
 * Server-side guard:
 * if there is no `plnadmin` cookie, redirect to login (same behaviour as other BO pages).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { plnadmin } = parseCookies(ctx);

  if (!plnadmin) {
    const currentUrl = ctx.resolvedUrl;
    const loginUrl = `/?backlink=${currentUrl}`;
    return {
      redirect: {
        destination: loginUrl,
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';

import { ApprovalLayout } from '../../layout/approval-layout';
import api from '../../utils/api';
import s from './styles.module.scss';
import clsx from 'clsx';
import { CloseIcon } from '../../screens/members/components/icons';
import { TeamAccessLevelSelect } from './components/TeamAccessLevelSelect';
import { useAuth } from '../../context/auth-context';
import { ConfirmSaveDrawer } from '../../components/common/ConfirmSaveDrawer';

type PendingTeamAccessLevelChange = {
  teamUid: string;
  accessLevel: AccessLevel;
};

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
  /**
   * Legacy tier: 0..4 (or -1/NULL = NA)
   * Kept for backward compatibility.
   */
  tier: number | null;

  /**
   * New priority: 1..5, or 99/NULL = NA
   * This is what we display in UI going forward.
   */
  priority: number | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Tier <-> Priority mapping.
 * Priority is the new UI term:
 *   - Lower number = higher importance
 *   - 99 (or null) = Not Assigned
 */
function tierToPriority(tier: number | null | undefined): number {
  if (tier === null || tier === undefined) return 99;
  if (tier >= 0 && tier <= 4) return 5 - tier;
  return 99;
}

function priorityToTier(priority: number | null | undefined): number {
  if (priority === null || priority === undefined) return -1;
  if (priority >= 1 && priority <= 5) return 5 - priority;
  return -1;
}

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const TeamsPage: React.FC = () => {
  const router = useRouter();
  const { isDirectoryAdmin } = useAuth();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Pending access level changes for batch saving
  const [pendingAccessLevelChanges, setPendingAccessLevelChanges] = useState<Map<string, PendingTeamAccessLevelChange>>(
    new Map()
  );
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // Search state
  const [search, setSearch] = useState('');

  // Right-side editor state
  const [selectedTeamUid, setSelectedTeamUid] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TeamRow>>({});
  const [savingTeam, setSavingTeam] = useState(false);

  const { isLoading, user } = useAuth();

  // Redirect non-directory admins to demo-days
  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

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

      // Normalise tier/priority to number | null, to avoid "undefined" issues
      const data: TeamRow[] = rawTeams.map((t) => ({
        ...t,
        tier: t.tier === undefined || t.tier === null || t.tier === '' ? null : Number(t.tier),
        priority: t.priority === undefined || t.priority === null || t.priority === '' ? null : Number(t.priority),
      }));

      setTeams(data);
    } catch (e) {
      console.error('Failed to load teams', e);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handles access level change - tracks as pending instead of saving immediately
   */
  const handleAccessLevelChange = useCallback(
    (teamUid: string, accessLevel: AccessLevel) => {
      const team = teams.find((t) => t.uid === teamUid);

      if (!team) {
        return;
      }

      // Check if the new value is different from the original
      const hasChanged = accessLevel !== team.accessLevel;

      setPendingAccessLevelChanges((prev) => {
        const next = new Map(prev);
        if (hasChanged) {
          next.set(teamUid, { teamUid, accessLevel });
        } else {
          next.delete(teamUid);
        }
        return next;
      });
    },
    [teams]
  );

  /**
   * Saves all pending access level changes
   */
  const handleSaveBatch = useCallback(async () => {
    if (pendingAccessLevelChanges.size === 0) {
      return;
    }

    setIsSavingBatch(true);

    const cookies = parseCookies();
    const config = {
      headers: { authorization: `Bearer ${cookies.plnadmin}` },
    };

    const changes = Array.from(pendingAccessLevelChanges.values());

    try {
      const promises = changes.map((change) =>
        api.patch(`/v1/teams/${change.teamUid}/access-level`, { accessLevel: change.accessLevel }, config)
      );

      await Promise.all(promises);

      // Update local state with new values
      setTeams((prev) =>
        prev.map((t) => {
          const change = pendingAccessLevelChanges.get(t.uid);
          return change ? { ...t, accessLevel: change.accessLevel } : t;
        })
      );

      setPendingAccessLevelChanges(new Map());

      toast.success(`Successfully saved ${changes.length} change${changes.length !== 1 ? 's' : ''}`);
    } catch (e) {
      console.error('Failed to save access level changes', e);
      toast.error('Failed to save changes. Please try again.');
    } finally {
      setIsSavingBatch(false);
    }
  }, [pendingAccessLevelChanges]);

  /**
   * Resets all pending access level changes
   */
  const handleResetBatch = useCallback(() => {
    setPendingAccessLevelChanges(new Map());
  }, []);

  /**
   * Gets the display value for access level (pending or actual)
   */
  const getDisplayAccessLevel = useCallback(
    (teamUid: string, actualLevel: AccessLevel): AccessLevel => {
      const pending = pendingAccessLevelChanges.get(teamUid);
      return pending ? pending.accessLevel : actualLevel;
    },
    [pendingAccessLevelChanges]
  );

  const pendingChangeCount = useMemo(() => pendingAccessLevelChanges.size, [pendingAccessLevelChanges]);

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
      // Prefer priority if present; otherwise derive it from tier.
      priority: team.priority ?? tierToPriority(team.tier),
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

      // Priority is the new canonical UI value.
      // We still store tier in DB for compatibility, so we always send BOTH.
      const priorityValueRaw = (editForm as any).priority;
      const priorityValue =
        priorityValueRaw === undefined || priorityValueRaw === null || priorityValueRaw === ''
          ? 99
          : Number(priorityValueRaw);

      const tierValue = priorityToTier(priorityValue);

      const newData: any = {
        name,
        website: editForm.website ?? '',
        shortDescription: editForm.shortDescription ?? '',
        longDescription: editForm.longDescription ?? '',
        plnFriend: !!editForm.plnFriend,
        // isFund is intentionally NOT editable on the right panel now
      };

      // Always send priority.
      // 1..5 => real priorities; 99 => NA.
      newData.priority = priorityValue;

      // Keep legacy tier in sync on write.
      // This makes the transition safe for any old code paths still relying on `tier`.
      newData.tier = tierValue;

      console.info(`[BackOffice] Saving team priority: teamUid=${selectedTeamUid}, priority=${priorityValue}, tier=${tierValue}`);

      await api.patch(`/v1/admin/teams/${selectedTeamUid}/full`, newData, config);

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
                tier: newData.tier !== undefined ? newData.tier : t.tier,
                priority: newData.priority !== undefined ? newData.priority : t.priority,
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

  // Don't render page content if user doesn't have access
  if (!isLoading && user && !isDirectoryAdmin) {
    return null;
  }

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
                      value={getDisplayAccessLevel(team.uid, team.accessLevel ?? 'L0')}
                      onChange={(val) => handleAccessLevelChange(team.uid, val)}
                      disabled={isSavingBatch}
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

          <ConfirmSaveDrawer
            label="Team"
            count={pendingChangeCount}
            onReset={handleResetBatch}
            onSave={handleSaveBatch}
            isSaving={isSavingBatch}
          />

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
                      <label className={s.formLabel}>Priority</label>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                        PL network team prioritization. Lower number = higher importance level.
                      </div>

                      <select
                        className={s.formInput}
                        value={(editForm as any).priority ?? 99}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const p = Number(raw);
                          // We store NA as 99.
                          onFieldChange('priority' as any, (Number.isNaN(p) ? 99 : p) as any);
                        }}
                      >
                        <option value={1}>Priority 1</option>
                        <option value={2}>Priority 2</option>
                        <option value={3}>Priority 3</option>
                        <option value={4}>Priority 4</option>
                        <option value={5}>Priority 5</option>
                        <option value={99}>Priority NA (Not Assigned)</option>
                      </select>
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

/* eslint-disable prettier/prettier */
import React, { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';

import { ApprovalLayout } from '../../layout/approval-layout';
import api from '../../utils/api';

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

const ACCESS_LEVELS: AccessLevel[] = ['L0', 'L1'];

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
      const data: TeamRow[] = rawTeams.map(t => ({
        ...t,
        tier:
          t.tier === undefined || t.tier === null || t.tier === ''
            ? null
            : Number(t.tier),
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

    try {
      setSavingUid(teamUid);
      const cookies = parseCookies();
      const config = {
        headers: { authorization: `Bearer ${cookies.plnadmin}` },
      };

      await api.patch(
        `/v1/teams/${teamUid}/access-level`,
        { accessLevel },
        config,
      );

      // Optimistic UI update
      setTeams(prev =>
        prev.map(t =>
          t.uid === teamUid ? { ...t, accessLevel } : t,
        ),
      );
    } catch (e) {
      console.error('Failed to update access level', e);
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
    setEditForm(prev => ({
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

      const tierValue =
        editForm.tier === undefined || editForm.tier === null
          ? null
          : Number(editForm.tier);

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

      await api.patch(
        `/v1/admin/teams/${selectedTeamUid}/full`,
        payload,
        config,
      );

      // Optimistic local update (including tier)
      setTeams(prev =>
        prev.map(t =>
          t.uid === selectedTeamUid
            ? {
              ...t,
              name: newData.name ?? t.name,
              website:
                newData.website !== undefined ? newData.website : t.website,
              shortDescription:
                newData.shortDescription !== undefined
                  ? newData.shortDescription
                  : t.shortDescription,
              longDescription:
                newData.longDescription !== undefined
                  ? newData.longDescription
                  : t.longDescription,
              plnFriend:
                newData.plnFriend !== undefined
                  ? newData.plnFriend
                  : t.plnFriend,
              tier:
                tierValue !== null
                  ? tierValue
                  : t.tier, // if no tier sent, keep previous value
            }
            : t,
        ),
      );

      closeEditor();
    } catch (e) {
      console.error('Failed to save team', e);
    } finally {
      setSavingTeam(false);
    }
  }

  const filteredTeams = teams.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.website ?? '').toLowerCase().includes(q)
    );
  });

  const selectedTeam = teams.find(t => t.uid === selectedTeamUid) || null;

  return (
    <ApprovalLayout>
      <div className="flex h-full">
        {/* Left side: Teams table */}
        <div className="flex-1 px-6 pt-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold">Teams</h1>
            <input
              className="border rounded-full px-4 py-2 text-sm w-72 shadow-sm bg-white"
              placeholder="Search by team name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {loading && <div>Loading teams…</div>}

          {!loading && (
            <div className="border rounded-2xl bg-white overflow-hidden shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-500">
                    Team
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500">
                    Access level
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500">
                    PLN friend
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500">
                    Is fund
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500">
                    Updated
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500 text-right">
                    Info
                  </th>
                </tr>
                </thead>
                <tbody>
                {filteredTeams.map(team => (
                  <tr
                    key={team.uid}
                    className="border-t hover:bg-gray-50 cursor-pointer"
                    onClick={() => openEditor(team)}
                  >
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                          <span className="font-medium text-gray-900">
                            {team.name}
                          </span>
                        {team.website && (
                          <span className="text-xs text-gray-500">
                              {team.website}
                            </span>
                        )}
                      </div>
                    </td>

                    {/* Access level dropdown — styled similar to Members page */}
                    <td
                      className="px-4 py-3"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="relative inline-block">
                        <select
                          className="appearance-none w-[140px] border rounded-full px-3 py-1 text-sm pr-8 bg-white cursor-pointer shadow-sm
                                       focus:outline-none focus:ring-2 focus:ring-gray-200"
                          value={team.accessLevel ?? 'L0'}
                          disabled={savingUid === team.uid}
                          onChange={e =>
                            updateAccessLevel(
                              team.uid,
                              e.target.value as AccessLevel,
                            )
                          }
                        >
                          {ACCESS_LEVELS.map(lvl => (
                            <option key={lvl} value={lvl}>
                              {lvl}
                            </option>
                          ))}
                        </select>
                        {/* Custom arrow so there is only one chevron */}
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                            ▼
                          </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {team.plnFriend ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-3">
                      {team.isFund ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(team.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(team.updatedAt).toLocaleDateString()}
                    </td>

                    {/* Info / Edit button, similar to Members table */}
                    <td
                      className="px-4 py-3 text-right"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                        onClick={() => openEditor(team)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M4 13.5L4.5 11L11.5 4L14 6.5L7 13.5L4 13.5Z"
                            stroke="#4B5563"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10.5 4L13 6.5"
                            stroke="#4B5563"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredTeams.length === 0 && (
                  <tr>
                    <td
                      className="px-6 py-8 text-center text-gray-500"
                      colSpan={7}
                    >
                      No teams found
                    </td>
                  </tr>
                )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right side: editor panel */}
        {selectedTeamUid && selectedTeam && (
          <div className="w-[420px] border-l bg-white px-6 py-6 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Edit team
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedTeam.website || ''}
                </p>
              </div>
              <button
                className="text-sm text-gray-500 hover:text-gray-800"
                onClick={closeEditor}
              >
                Close
              </button>
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Name
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={editForm.name ?? ''}
                  onChange={e => onFieldChange('name', e.target.value as any)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Website
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={editForm.website ?? ''}
                  onChange={e =>
                    onFieldChange('website', e.target.value as any)
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Short description
                </label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px]"
                  value={editForm.shortDescription ?? ''}
                  onChange={e =>
                    onFieldChange('shortDescription', e.target.value as any)
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Long description
                </label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]"
                  value={editForm.longDescription ?? ''}
                  onChange={e =>
                    onFieldChange('longDescription', e.target.value as any)
                  }
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!editForm.plnFriend}
                    onChange={e =>
                      onFieldChange('plnFriend', e.target.checked as any)
                    }
                  />
                  PLN friend
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Tier
                </label>
                <input
                  type="number"
                  min={0}
                  max={4}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={
                    editForm.tier === null || editForm.tier === undefined
                      ? ''
                      : String(editForm.tier)
                  }
                  onChange={e => {
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

            {/* Action buttons directly under the form (not stuck to the bottom) */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="text-sm px-3 py-1 border rounded-md"
                onClick={closeEditor}
              >
                Cancel
              </button>
              <button
                className="text-sm px-4 py-1 rounded-md bg-blue-600 text-white disabled:opacity-60"
                disabled={savingTeam}
                onClick={saveTeam}
              >
                {savingTeam ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ApprovalLayout>
  );
};

export default TeamsPage;

/**
 * Server-side guard:
 * if there is no `plnadmin` cookie, redirect to login (same behaviour as other BO pages).
 */
export const getServerSideProps: GetServerSideProps = async ctx => {
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

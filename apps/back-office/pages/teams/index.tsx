import React, { useEffect, useState } from 'react';
import { ApprovalLayout } from '../../layout/approval-layout';
import api from '../../utils/api';
import { parseCookies } from 'nookies';

type AccessLevel = 'L0' | 'L1' ;

type TeamRow = {
  uid: string;
  name: string;
  accessLevel: AccessLevel;
  plnFriend: boolean;
  isFund: boolean;
  website?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  tier?: number | null;
  createdAt: string;
  updatedAt: string;
};

const ACCESS_LEVELS: Exclude<AccessLevel, null>[] = [
  'L0',
  'L1',
];

const TeamsPage: React.FC = () => {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedTeamUid, setSelectedTeamUid] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TeamRow>>({});
  const [savingTeam, setSavingTeam] = useState(false);

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    try {
      setLoading(true);
      const cookies = parseCookies();
      const config = {
        headers: { authorization: `Bearer ${cookies.plnadmin}` },
      };
      const res = await api.get('/v1/admin/teams', config);
      const data = res.data?.teams ?? [];
      setTeams(data);
    } catch (e) {
      console.error('Failed to load teams', e);
    } finally {
      setLoading(false);
    }
  }

  async function updateAccessLevel(teamUid: string, accessLevel: AccessLevel) {
    if (!accessLevel) return;
    try {
      setSavingUid(teamUid);
      const cookies = parseCookies();
      const config = {
        headers: { authorization: `Bearer ${cookies.plnadmin}` },
      };
      // PATCH /v1/teams/:uid/access-level { accessLevel }
      await api.patch(
        `/v1/teams/${teamUid}/access-level`,
        { accessLevel },
        config,
      );

      setTeams((prev) =>
        prev.map((t) => (t.uid === teamUid ? { ...t, accessLevel } : t)),
      );
    } catch (e) {
      console.error('Failed to update access level', e);
    } finally {
      setSavingUid(null);
    }
  }

  function openEditor(team: TeamRow) {
    setSelectedTeamUid(team.uid);
    setEditForm({
      uid: team.uid,
      name: team.name,
      website: team.website ?? '',
      shortDescription: team.shortDescription ?? '',
      longDescription: team.longDescription ?? '',
      plnFriend: team.plnFriend,
      isFund: team.isFund,
      tier: team.tier ?? undefined,
    });
  }

  function closeEditor() {
    setSelectedTeamUid(null);
    setEditForm({});
  }

  function onFieldChange<K extends keyof TeamRow>(field: K, value: TeamRow[K]) {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  /**
   * Save handler:
   * builds payload in old ParticipantsRequest-style:
   * {
   *   participantType: "TEAM",
   *   uniqueIdentifier: name,
   *   newData: { ...fields... }
   * }
   *
   * and sends it to:
   * PATCH /v1/admin/teams/:uid/full
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

      const newData: any = {
        name,
        website: editForm.website ?? '',
        shortDescription: editForm.shortDescription ?? '',
        longDescription: editForm.longDescription ?? '',
        plnFriend: !!editForm.plnFriend,
        isFund: !!editForm.isFund,
      };

      if (editForm.tier !== undefined && editForm.tier !== null && editForm.tier !== ('' as any)) {
        newData.tier = Number(editForm.tier);
      }

      const payload = {
        participantType: 'TEAM',
        requesterEmailId: 'backoffice@plnetwork.io',
        uniqueIdentifier: name || selectedTeamUid,
        newData,
      };

      // REUSE old mapping on backend:
      // this.teamsService.updateTeamFromParticipantsRequest(teamUid, body, req.userEmail)
      await api.patch(
        `/v1/admin/teams/${selectedTeamUid}/full`,
        payload,
        config,
      );

      // optimistic local update
      setTeams((prev) =>
        prev.map((t) =>
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
              isFund:
                newData.isFund !== undefined ? newData.isFund : t.isFund,
              tier:
                newData.tier !== undefined
                  ? newData.tier
                  : t.tier ?? null,
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

  const filteredTeams = teams.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q);
  });

  return (
    <ApprovalLayout>
      <div className="flex h-full">
        {/* Left side: table */}
        <div className="flex-1 px-6 pt-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold">Teams</h1>
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && <div>Loading teams…</div>}

          {!loading && (
            <div className="border rounded-md bg-white overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Access level</th>
                  <th className="px-3 py-2 text-left">PLN friend</th>
                  <th className="px-3 py-2 text-left">Is fund</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                </tr>
                </thead>
                <tbody>
                {filteredTeams.map((team) => (
                  <tr
                    key={team.uid}
                    className="border-t cursor-pointer hover:bg-gray-50"
                    onClick={() => openEditor(team)}
                  >
                    <td className="px-3 py-2">{team.name}</td>
                    <td
                      className="px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={team.accessLevel ?? 'L0'}
                        disabled={savingUid === team.uid}
                        onChange={(e) =>
                          updateAccessLevel(
                            team.uid,
                            e.target.value as AccessLevel,
                          )
                        }
                      >
                        {ACCESS_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {team.plnFriend ? 'Yes' : 'No'}
                    </td>
                    <td className="px-3 py-2">
                      {team.isFund ? 'Yes' : 'No'}
                    </td>
                    <td className="px-3 py-2">
                      {new Date(team.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      {new Date(team.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}

                {filteredTeams.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-gray-500"
                      colSpan={6}
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
        {selectedTeamUid && (
          <div className="w-[380px] border-l bg-white px-4 pt-6 pb-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Edit team</h2>
              <button
                className="text-sm text-gray-500 hover:text-gray-800"
                onClick={closeEditor}
              >
                Close
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Name
                </label>
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editForm.name ?? ''}
                  onChange={(e) => onFieldChange('name', e.target.value as any)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Website
                </label>
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={editForm.website ?? ''}
                  onChange={(e) =>
                    onFieldChange('website', e.target.value as any)
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Short description
                </label>
                <textarea
                  className="w-full border rounded px-2 py-1 text-sm min-h-[60px]"
                  value={editForm.shortDescription ?? ''}
                  onChange={(e) =>
                    onFieldChange(
                      'shortDescription',
                      e.target.value as any,
                    )
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Long description
                </label>
                <textarea
                  className="w-full border rounded px-2 py-1 text-sm min-h-[80px]"
                  value={editForm.longDescription ?? ''}
                  onChange={(e) =>
                    onFieldChange('longDescription', e.target.value as any)
                  }
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!editForm.plnFriend}
                    onChange={(e) =>
                      onFieldChange('plnFriend', e.target.checked as any)
                    }
                  />
                  PLN friend
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!editForm.isFund}
                    onChange={(e) =>
                      onFieldChange('isFund', e.target.checked as any)
                    }
                  />
                  Is fund
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
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={
                    editForm.tier !== undefined && editForm.tier !== null
                      ? editForm.tier
                      : ''
                  }
                  onChange={(e) =>
                    onFieldChange(
                      'tier',
                      e.target.value === ''
                        ? (undefined as any)
                        : (Number(e.target.value) as any),
                    )
                  }
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t mt-4">
              <button
                className="text-sm px-3 py-1 border rounded"
                onClick={closeEditor}
              >
                Cancel
              </button>
              <button
                className="text-sm px-4 py-1 rounded bg-blue-600 text-white disabled:opacity-60"
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

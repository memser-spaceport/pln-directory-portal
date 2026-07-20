import React, { useEffect, useState } from 'react';
import { ApprovalLayout } from '../../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import api from '../../../utils/api';
import { API_ROUTE } from '../../../utils/constants';
import { useAuth } from '../../../context/auth-context';
import { useCreateTeamPitch } from '../../../hooks/team-pitches/useCreateTeamPitch';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import Image from 'next/image';

const RichTextEditor = dynamic(() => import('../../../components/common/rich-text-editor'), { ssr: false });

type TeamOption = { uid: string; name: string; logoUrl?: string | null };

const CreateTeamPitchPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { canMutateTeamPitches, isLoading } = useAuth();
  const createMutation = useCreateTeamPitch();
  const [teamSearch, setTeamSearch] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamName, setSelectedTeamName] = useState('');
  const [selectedTeamLogo, setSelectedTeamLogo] = useState<string | null>(null);
  const [form, setForm] = useState({
    teamUid: '',
    title: '',
    description: '',
    slug: '',
    status: 'DRAFT',
    supportEmail: '',
    senderEmail: '',
  });

  useEffect(() => {
    if (!authToken) {
      router.replace(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (!isLoading && !canMutateTeamPitches) {
      router.replace('/');
    }
  }, [canMutateTeamPitches, isLoading, router]);

  useEffect(() => {
    if (!authToken || !teamSearch.trim()) {
      setTeams([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(API_ROUTE.TEAMS_SEARCH, {
          headers: { authorization: `Bearer ${authToken}` },
          params: { searchBy: teamSearch, limit: 50 },
        });
        setTeams(
          (data?.teams ?? []).map((team: { uid: string; name: string; logo?: { url?: string } | null }) => ({
            uid: team.uid,
            name: team.name,
            logoUrl: team.logo?.url ?? null,
          }))
        );
      } catch {
        setTeams([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [authToken, teamSearch]);

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    try {
      const created = await createMutation.mutateAsync({
        authToken,
        data: {
          ...form,
          supportEmail: form.supportEmail.trim() || null,
          senderEmail: form.senderEmail.trim() || null,
        },
      });
      router.push(`/teams/team-pitches/${created.uid}`);
    } catch {
      alert('Failed to create team spotlight. Please try again.');
    }
  };

  if (!authToken || isLoading) {
    return null;
  }

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-6">
          <button onClick={() => router.back()} className="mb-4 text-blue-600 hover:text-blue-800">
            ← Back to Team Spotlights
          </button>
          <h1 className="text-3xl font-semibold text-gray-900">Create New Team Spotlight</h1>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label htmlFor="team" className="mb-2 block text-sm font-medium text-gray-700">
                Team *
              </label>
              <input
                type="text"
                id="team"
                placeholder="Search team by name..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {form.teamUid && selectedTeamName && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <span>Selected:</span>
                  {selectedTeamLogo ? (
                    <Image
                      src={selectedTeamLogo}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-200 text-xs font-medium text-gray-600">
                      {selectedTeamName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium text-gray-900">{selectedTeamName}</span>
                </div>
              )}
              {teams.length > 0 && (
                <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="divide-y divide-gray-100">
                    {teams.map((team) => (
                      <button
                        key={team.uid}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            teamUid: team.uid,
                            slug: f.slug || slugify(team.name),
                          }));
                          setSelectedTeamName(team.name);
                          setSelectedTeamLogo(team.logoUrl ?? null);
                          setTeamSearch(team.name);
                          setTeams([]);
                        }}
                        className={clsx(
                          'flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-gray-50',
                          form.teamUid === team.uid && 'border-l-4 border-blue-500 bg-blue-50'
                        )}
                      >
                        {team.logoUrl ? (
                          <Image
                            src={team.logoUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 flex-shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-gray-200">
                            <span className="text-sm font-medium text-gray-600">
                              {team.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900">{team.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="title" className="mb-2 block text-sm font-medium text-gray-700">
                Title *
              </label>
              <input
                type="text"
                id="title"
                required
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    title: e.target.value,
                    slug: f.slug || slugify(e.target.value),
                  }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter spotlight title"
              />
            </div>

            <div>
              <label htmlFor="slug" className="mb-2 block text-sm font-medium text-gray-700">
                URL Slug *
              </label>
              <input
                type="text"
                id="slug"
                required
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="team-spotlight-slug"
              />
              <p className="mt-1 text-sm text-gray-500">
                This will be used in the URL: /spotlight/{form.slug || 'team-spotlight-slug'}
              </p>
            </div>

            <div>
              <label htmlFor="description" className="mb-2 block text-sm font-medium text-gray-700">
                Description *
              </label>
              <RichTextEditor
                id="description"
                value={form.description}
                onChange={(value) => setForm((f) => ({ ...f, description: value }))}
                placeholder="Enter spotlight description"
              />
            </div>

            <div>
              <label htmlFor="status" className="mb-2 block text-sm font-medium text-gray-700">
                Status *
              </label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            <div>
              <label htmlFor="supportEmail" className="mb-2 block text-sm font-medium text-gray-700">
                Support Email
              </label>
              <input
                type="email"
                id="supportEmail"
                value={form.supportEmail}
                onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave blank to use default support email"
              />
            </div>

            <div>
              <label htmlFor="senderEmail" className="mb-2 block text-sm font-medium text-gray-700">
                Sender Email
              </label>
              <input
                type="email"
                id="senderEmail"
                value={form.senderEmail}
                onChange={(e) => setForm((f) => ({ ...f, senderEmail: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave blank to use system default"
              />
              <p className="mt-1 text-xs text-gray-500">From address used for investor invite and follow-up emails.</p>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !form.teamUid}
                className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Team Spotlight'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default CreateTeamPitchPage;

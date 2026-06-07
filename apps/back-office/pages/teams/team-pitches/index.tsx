import React, { useEffect, useState } from 'react';
import { ApprovalLayout } from '../../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import Link from 'next/link';
import { useAuth } from '../../../context/auth-context';
import { useTeamPitchesList } from '../../../hooks/team-pitches/useTeamPitchesList';
import { WEB_UI_BASE_URL } from '../../../utils/constants';

const TeamPitchesPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { canViewTeamPitches, canMutateTeamPitches, isLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { data: pitches, isLoading: listLoading } = useTeamPitchesList({
    authToken,
    search: search || undefined,
    status: status || undefined,
  });

  useEffect(() => {
    if (!authToken) {
      router.replace(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (!isLoading && authToken && !canViewTeamPitches) {
      router.replace('/');
    }
  }, [authToken, canViewTeamPitches, isLoading, router]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const getStatusColor = (pitchStatus: string) => {
    switch (pitchStatus) {
      case 'OPEN':
        return 'text-green-600 bg-green-100';
      case 'CLOSED':
        return 'text-red-600 bg-red-100';
      case 'DRAFT':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (!authToken || isLoading) {
    return null;
  }

  if (!canViewTeamPitches) {
    return null;
  }

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-gray-900">Team Pitches</h1>
          {canMutateTeamPitches && (
            <button
              onClick={() => router.push('/teams/team-pitches/create')}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Create New Pitch
            </button>
          )}
        </div>

        <div className="mb-4 flex gap-3">
          <input
            type="text"
            placeholder="Search by pitch or team name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : !pitches || pitches.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
            No team pitches found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Team
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Date Created
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Status
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">View</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pitches.map((pitch) => (
                  <tr key={pitch.uid} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{pitch.title}</td>
                    <td className="px-6 py-4">
                      <a
                        href={`${WEB_UI_BASE_URL}/teams/${pitch.team.uid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:text-blue-900"
                      >
                        {pitch.team.name}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{formatDate(pitch.createdAt)}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(
                          pitch.status
                        )}`}
                      >
                        {pitch.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                      <Link href={`/teams/team-pitches/${pitch.uid}`}>
                        <a className="text-blue-600 hover:text-blue-900">View Details</a>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ApprovalLayout>
  );
};

export default TeamPitchesPage;

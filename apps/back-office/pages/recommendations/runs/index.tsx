import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { parseCookies } from 'nookies';
import { Member, MemberSearch } from '../../../components/members/membersearch';
import api from '../../../utils/api';
import { ROUTE_CONSTANTS, WEB_UI_BASE_URL } from '../../../utils/constants';
import { RecommendationsLayout } from '../../../layout/recommendations-layout';
import { fetchRecommendationRuns } from '../../../utils/services/recommendations';

interface RecommendationRun {
  uid: string;
  targetMember: {
    name: string;
    uid: string;
  };
  status: string;
  createdAt: string;
  recommendations: {
    status: string;
  }[];
}

export default function RecommendationRunListPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [runs, setRuns] = useState<RecommendationRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    try {
      setIsLoading(true);
      const response = await fetchRecommendationRuns();
      setRuns(response);
    } catch (error) {
      console.error('Failed to fetch runs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRun = async () => {
    if (!selectedMember) return;

    try {
      setIsCreatingRun(true);
      const { plnadmin } = parseCookies();
      const config = {
        headers: {
          authorization: `Bearer ${plnadmin}`,
        },
      };
      const response = await api.post(
        '/v1/admin/recommendations/runs',
        { targetMemberUid: selectedMember.uid },
        config
      );
      await fetchRuns();
      router.push(`${ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS}/${response.data.uid}`);
    } catch (error) {
      console.error('Failed to create run:', error);
    } finally {
      setIsCreatingRun(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-yellow-100 text-yellow-800';
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800';
      case 'SENT':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isCreating) {
    return (
      <RecommendationsLayout
        title="Create Recommendation Run"
        actionButton={{
          label: 'Cancel',
          onClick: () => setIsCreating(false),
        }}
      >
        <div className="m-auto mt-6 h-[92%] max-w-[900px] p-6">
          <div className="mb-6">
            <MemberSearch onSelect={(member) => setSelectedMember(member)} selectedMember={selectedMember} />
          </div>

          <div className="mb-6">
            {selectedMember && (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
                {selectedMember.imageUrl ? (
                  <img
                    src={selectedMember.imageUrl}
                    alt={selectedMember.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-lg font-medium text-gray-500">
                    {selectedMember.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="text-lg font-medium">
                    <a
                      href={`${WEB_UI_BASE_URL}/members/${selectedMember.uid}`}
                      className="text-blue-600 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selectedMember.name}
                    </a>
                  </div>
                  {selectedMember.teamMemberRoles?.[0]?.team && (
                    <div className="text-sm text-gray-500">
                      {selectedMember.teamMemberRoles[0].team.name}
                      {selectedMember.teamMemberRoles[0].role && ` • ${selectedMember.teamMemberRoles[0].role}`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
            onClick={handleCreateRun}
            disabled={!selectedMember || isCreatingRun}
          >
            {isCreatingRun ? 'Creating...' : 'Generate Recommendations'}
          </button>
        </div>
      </RecommendationsLayout>
    );
  }

  return (
    <RecommendationsLayout
      activeTab="runs"
      actionButton={{
        label: 'New Recommendation Run',
        onClick: () => setIsCreating(true),
      }}
    >
      <div className="m-auto mt-6 h-[92%] max-w-[900px] overflow-y-auto bg-white p-6">
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-white">
                  <th className="py-3 text-left">Member</th>
                  <th className="py-3 text-left">Status</th>
                  <th className="py-3 text-left">Date</th>
                  <th className="py-3 text-left">Recommendations</th>
                  <th className="py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs?.map((run) => (
                  <tr key={run.uid} className="border-b">
                    <td className="py-3">
                      <a
                        href={`${WEB_UI_BASE_URL}/members/${run.targetMember.uid}`}
                        className="text-blue-600 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {run.targetMember.name}
                      </a>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                          run.status
                        )}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {new Date(run.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3">
                      {run.recommendations.filter((r) => r.status === 'APPROVED').length} approved
                    </td>
                    <td className="py-3">
                      <button
                        className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300"
                        onClick={() => router.push(`${ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS}/${run.uid}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RecommendationsLayout>
  );
}

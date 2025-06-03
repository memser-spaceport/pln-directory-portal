import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { parseCookies } from 'nookies';
import api from '../../../utils/api';
import { BaseLayout } from '../../../layout/base-layout';

interface Recommendation {
  uid: string;
  recommendedMember: {
    name: string;
    uid: string;
  };
  score: number;
  status: string;
  factors: {
    sameTeam: boolean;
    previouslyRecommended: boolean;
    bookedOH: boolean;
    sameEvent: boolean;
    teamFocusArea: boolean;
    teamFundingStage: boolean;
    roleMatch: boolean;
    teamTechnology: boolean;
    hasOfficeHours: boolean;
    joinDateScore: number;
  };
}

interface RecommendationRun {
  uid: string;
  targetMember: {
    name: string;
    uid: string;
  };
  status: string;
  createdAt: string;
  recommendations: Recommendation[];
}

export default function RecommendationRunViewPage() {
  const router = useRouter();
  const { uid } = router.query;
  const [run, setRun] = useState<RecommendationRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [localRecommendations, setLocalRecommendations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (uid) {
      fetchRun();
    }
  }, [uid]);

  const fetchRun = async () => {
    try {
      setIsLoading(true);
      const { plnadmin } = parseCookies();
      const config = {
        headers: {
          authorization: `Bearer ${plnadmin}`,
        },
      };
      const response = await api.get(`/v1/admin/recommendations/runs/${uid}`, config);
      setRun(response.data);
      // Initialize local recommendations state
      const initialLocalState: Record<string, string> = {};
      response.data.recommendations.forEach((rec: Recommendation) => {
        initialLocalState[rec.uid] = rec.status;
      });
      setLocalRecommendations(initialLocalState);
    } catch (error) {
      console.error('Failed to fetch run:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = (recommendationUid: string, status: string) => {
    setLocalRecommendations((prev) => ({
      ...prev,
      [recommendationUid]: status,
    }));
  };

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      const { plnadmin } = parseCookies();
      const config = {
        headers: {
          authorization: `Bearer ${plnadmin}`,
        },
      };

      const approvedUids = Object.entries(localRecommendations)
        .filter(([_, status]) => status === 'APPROVED')
        .map(([uid]) => uid);

      const rejectedUids = Object.entries(localRecommendations)
        .filter(([_, status]) => status === 'REJECTED')
        .map(([uid]) => uid);

      await api.post(
        `/v1/admin/recommendations/runs/${uid}/generate-more`,
        {
          approvedRecommendationUids: approvedUids,
          rejectedRecommendationUids: rejectedUids,
        },
        config
      );
      await fetchRun();
    } catch (error) {
      console.error('Failed to regenerate recommendations:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSendEmail = async () => {
    try {
      setIsSendingEmail(true);
      const { plnadmin } = parseCookies();
      const config = {
        headers: {
          authorization: `Bearer ${plnadmin}`,
        },
      };
      const approvedUids = Object.entries(localRecommendations)
        .filter(([_, status]) => status === 'APPROVED')
        .map(([uid]) => uid);
      await api.post(
        `/v1/admin/recommendations/runs/${uid}/send`,
        {
          approvedRecommendationUids: approvedUids,
        },
        config
      );
      await fetchRun();
      toast.warning('Email sending is not implemented yet');
    } catch (error) {
      console.error('Failed to send email:', error);
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (!uid) {
    return (
      <BaseLayout
        title={`Recommendation Run`}
        actionButton={{
          label: 'Back to List',
          onClick: () => router.push('/recommendations/runs'),
        }}
      >
        <div className="m-6 bg-white p-6 text-center">No recommendation run ID provided</div>
      </BaseLayout>
    );
  }

  if (isLoading && !run) {
    return (
      <BaseLayout
        title={`Recommendation Run`}
        actionButton={{
          label: 'Back to List',
          onClick: () => router.push('/recommendations/runs'),
        }}
      >
        <div className="m-6 bg-white p-6 text-center">Loading...</div>
      </BaseLayout>
    );
  }

  if (!run) {
    return (
      <BaseLayout
        title={`Recommendation Run`}
        actionButton={{
          label: 'Back to List',
          onClick: () => router.push('/recommendations/runs'),
        }}
      >
        <div className="m-6 bg-white p-6 text-center">No recommendation run found</div>
      </BaseLayout>
    );
  }

  const approvedCount = Object.values(localRecommendations).filter((status) => status === 'APPROVED').length;
  const rejectedCount = Object.values(localRecommendations).filter((status) => status === 'REJECTED').length;
  const pendingCount = Object.values(localRecommendations).filter((status) => status === 'PENDING').length;
  const activeCount = approvedCount + pendingCount;

  return (
    <BaseLayout
      title={`Recommendation Run - ${run.targetMember.name}`}
      actionButton={{
        label: 'Back to List',
        onClick: () => router.push('/recommendations/runs'),
      }}
    >
      <div className="m-6 bg-white p-6">
        <div className="mb-6">
          <div>
            <h1 className="text-2xl font-bold">Recommendation Run</h1>
            <p className="text-gray-600">
              For{' '}
              <a
                href={`${process.env.WEB_UI_BASE_URL}/members/${run.targetMember.uid}`}
                className="text-blue-600 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {run.targetMember.name}
              </a>{' '}
              • Created{' '}
              {new Date(run.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-4">
            <div className="rounded-lg bg-gray-100 p-4">
              <div className="text-sm text-gray-600">Status</div>
              <div
                className={`font-medium ${
                  run.status === 'OPEN'
                    ? 'text-yellow-600'
                    : run.status === 'CLOSED'
                    ? 'text-red-600'
                    : run.status === 'SENT'
                    ? 'text-green-600'
                    : 'text-gray-900'
                }`}
              >
                {run.status}
              </div>
            </div>
            <div className="rounded-lg bg-gray-100 p-4">
              <div className="text-sm text-gray-600">Total Recommendations</div>
              <div className="font-medium">{run.recommendations.length}</div>
            </div>
            <div className="rounded-lg bg-gray-100 p-4">
              <div className="text-sm text-gray-600">Approved</div>
              <div className="font-medium">{approvedCount}</div>
            </div>
            <div className="rounded-lg bg-gray-100 p-4">
              <div className="text-sm text-gray-600">Rejected</div>
              <div className="font-medium">{rejectedCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              {rejectedCount > 0 && activeCount < 5 && (
                <div className="flex gap-4">
                  <button
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                  >
                    {isRegenerating ? 'Regenerating...' : 'Regenerate Recommendations'}
                  </button>
                </div>
              )}
            </div>
            <div>
              {approvedCount > 0 && run.status === 'OPEN' && (
                <button
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
                  onClick={handleSendEmail}
                  disabled={isSendingEmail}
                >
                  {isSendingEmail ? 'Sending...' : 'Send Email'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {run.recommendations.length === 0 && (
            <div className="rounded-lg p-4">
              <div className="text-lg text-gray-600">No recommendations found</div>
            </div>
          )}
          {run.recommendations
            .filter((recommendation) => recommendation.status !== 'REJECTED')
            .sort((a, b) => (a.status === 'PENDING' ? -1 : 1))
            .map((recommendation) => {
              const currentStatus = localRecommendations[recommendation.uid] || recommendation.status;
              return (
                <div key={recommendation.uid} className="rounded-lg border p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">
                        <a
                          href={`${process.env.WEB_UI_BASE_URL}/members/${recommendation.recommendedMember.uid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {recommendation.recommendedMember.name}
                        </a>
                      </h3>
                      <p className="text-sm text-gray-600">Score: {recommendation.score}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className={`rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-green-300 ${
                          currentStatus === 'APPROVED' ? 'bg-green-300 text-white' : 'bg-gray-200 text-gray-900'
                        }`}
                        onClick={() => handleUpdateStatus(recommendation.uid, 'APPROVED')}
                      >
                        Approve
                      </button>
                      <button
                        className={`rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-red-300 ${
                          currentStatus === 'REJECTED' ? 'bg-red-300 text-white' : 'bg-gray-200 text-gray-900'
                        }`}
                        onClick={() => handleUpdateStatus(recommendation.uid, 'REJECTED')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Factors</div>
                      <ul className="mt-2 space-y-1">
                        <li>Same Team: {!recommendation.factors.sameTeam ? 'Yes' : 'No'}</li>
                        <li>Previously Recommended: {!recommendation.factors.previouslyRecommended ? 'Yes' : 'No'}</li>
                        <li>Booked Office Hours: {!recommendation.factors.bookedOH ? 'Yes' : 'No'}</li>
                        <li>Same Event: {!recommendation.factors.sameEvent ? 'Yes' : 'No'}</li>
                      </ul>
                    </div>
                    <div>
                      <div className="font-medium">Matches</div>
                      <ul className="mt-2 space-y-1">
                        <li>Role Match: {recommendation.factors.roleMatch ? 'Yes' : 'No'}</li>
                        <li>Team Focus Area: {recommendation.factors.teamFocusArea ? 'Yes' : 'No'}</li>
                        <li>Team Funding Stage: {recommendation.factors.teamFundingStage ? 'Yes' : 'No'}</li>
                        <li>Team Technology : {recommendation.factors.teamTechnology ? 'Yes' : 'No'}</li>
                        <li>Has Office Hours: {recommendation.factors.hasOfficeHours ? 'Yes' : 'No'}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </BaseLayout>
  );
}

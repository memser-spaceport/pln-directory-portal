import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { parseCookies } from 'nookies';
import api from '../../../utils/api';
import { RecommendationsLayout } from '../../../layout/recommendations-layout';
import { ROUTE_CONSTANTS, WEB_UI_BASE_URL } from '../../../utils/constants';
import { EmailConfirmationModal } from '../../../components/email-confirmation-modal';
import { RecommendationRun, Recommendation, fetchRecommendationRun } from '../../../utils/services/recommendations';

export default function RecommendationRunViewPage() {
  const router = useRouter();
  const { uid } = router.query;
  const [run, setRun] = useState<RecommendationRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [localRecommendations, setLocalRecommendations] = useState<Record<string, string>>({});
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  useEffect(() => {
    if (uid) {
      fetchRun();
    }
  }, [uid]);

  const fetchRun = async () => {
    try {
      setIsLoading(true);
      const response = await fetchRecommendationRun(uid as string);
      setRun(response);
      // Initialize local recommendations state
      const initialLocalState: Record<string, string> = {};
      response.recommendations.forEach((rec: Recommendation) => {
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

  const handleSendEmail = async (subject: string, email: string) => {
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
          emailSubject: subject,
          email,
        },
        config
      );
      await fetchRun();
      toast.success('Email sent successfully');
    } catch (error) {
      console.error('Failed to send email:', error);
      toast.error('Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const renderMatch = (label: string, score: boolean, value?: string[]) => {
    return (
      <li>
        {label}: {score ? `Yes${value ? ` (${value.join(', ')})` : ''}` : 'No'}
      </li>
    );
  };

  if (!uid) {
    return (
      <RecommendationsLayout
        title={`Recommendation Run`}
        actionButton={{
          label: 'Back to List',
          onClick: () => router.push(ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS),
        }}
      >
        <div className="m-6 bg-white p-6 text-center">No recommendation run ID provided</div>
      </RecommendationsLayout>
    );
  }

  if (isLoading && !run) {
    return (
      <RecommendationsLayout
        title={`Recommendation Run`}
        actionButton={{
          label: 'Back to List',
          onClick: () => router.push(ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS),
        }}
      >
        <div className="m-6 bg-white p-6 text-center">Loading...</div>
      </RecommendationsLayout>
    );
  }

  if (!run) {
    return (
      <RecommendationsLayout
        title={`Recommendation Run`}
        actionButton={{
          label: 'Back to List',
          onClick: () => router.push(ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS),
        }}
      >
        <div className="m-6 bg-white p-6 text-center">No recommendation run found</div>
      </RecommendationsLayout>
    );
  }

  const approvedCount = Object.values(localRecommendations).filter((status) => status === 'APPROVED').length;
  const rejectedCount = Object.values(localRecommendations).filter((status) => status === 'REJECTED').length;
  const pendingCount = Object.values(localRecommendations).filter((status) => status === 'PENDING').length;
  const activeCount = approvedCount + pendingCount;

  return (
    <RecommendationsLayout
      title={`Recommendation Run - ${run.targetMember.name}`}
      actionButton={{
        label: 'Back to List',
        onClick: () => router.push(ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS),
      }}
    >
      <div className="m-6 bg-white p-6">
        <div className="mb-6">
          <div>
            <h1 className="text-2xl font-bold">Recommendation Run</h1>
            <p className="text-gray-600">
              For{' '}
              <a
                href={`${WEB_UI_BASE_URL}/members/${run.targetMember.uid}`}
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
              {approvedCount > 0 && (
                <button
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
                  onClick={() => setIsEmailModalOpen(true)}
                  disabled={isSendingEmail}
                >
                  {isSendingEmail ? 'Sending...' : run.status === 'OPEN' ? 'Send Email' : 'Resend Email'}
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
                          href={`${WEB_UI_BASE_URL}/members/${recommendation.recommendedMember.uid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {recommendation.recommendedMember.name}
                        </a>
                      </h3>
                      <p className="text-sm text-gray-600">
                        Join Date:{' '}
                        {new Date(recommendation.recommendedMember.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
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
                      <div className="flex gap-4">
                        <div>
                          <div className="font-medium">Factors</div>
                          <ul className="mt-2 space-y-1">
                            <li>Same Team: {!recommendation.factors.sameTeam ? 'Yes' : 'No'}</li>
                            <li>
                              Previously Recommended: {!recommendation.factors.previouslyRecommended ? 'Yes' : 'No'}
                            </li>
                            <li>Booked Office Hours: {!recommendation.factors.bookedOH ? 'Yes' : 'No'}</li>
                            <li>Same Event: {!recommendation.factors.sameEvent ? 'Yes' : 'No'}</li>
                          </ul>
                        </div>
                        <div>
                          <div className="font-medium">Matches</div>
                          <ul className="mt-2 space-y-1">
                            {renderMatch(
                              'Role Match',
                              recommendation.factors.roleMatch,
                              recommendation.factors.matchedRoles
                            )}
                            <li>
                              {renderMatch(
                                'Team Focus Area',
                                recommendation.factors.teamFocusArea,
                                recommendation.factors.matchedFocusAreas
                              )}
                            </li>
                            <li>
                              {renderMatch(
                                'Team Technology',
                                recommendation.factors.teamTechnology,
                                recommendation.factors.matchedTechnologies
                              )}
                            </li>
                            <li>
                              {renderMatch(
                                'Team Industry Tag',
                                recommendation.factors.teamIndustryTag,
                                recommendation.factors.matchedIndustryTags
                              )}
                            </li>
                            <li>{renderMatch('Team Funding Stage', recommendation.factors.teamFundingStage)}</li>
                            {renderMatch('Has Office Hours', recommendation.factors.hasOfficeHours)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <EmailConfirmationModal
        isOpen={isEmailModalOpen}
        onClose={(confirmed, subject, email) => {
          setIsEmailModalOpen(false);
          if (confirmed && subject && email) {
            handleSendEmail(subject, email);
          }
        }}
        approvedMembers={run.recommendations
          .filter((rec) => localRecommendations[rec.uid] === 'APPROVED')
          .map((rec) => rec.recommendedMember)}
        defaultSubject="Your Recommended Connections from PL Network"
        targetMemberEmail={run.targetMember.email}
      />
    </RecommendationsLayout>
  );
}

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { parseCookies } from 'nookies';
import { RecommendationsLayout } from '../../../layout/recommendations-layout';
import { ROUTE_CONSTANTS, WEB_UI_BASE_URL } from '../../../utils/constants';
import api from '../../../utils/api';
import { API_ROUTE } from '../../../utils/constants';

interface Member {
  uid: string;
  name: string;
  email: string;
  image?: {
    url: string;
  };
  teamMemberRoles?: Array<{
    team: {
      name: string;
    };
    role: string;
  }>;
  isSubscribedToNewsletter: boolean;
  recommendationRunsAsTarget?: Array<{
    uid: string;
    createdAt: string;
    status: string;
    emailNotifications: Array<{
      email: string;
      subject: string;
      isExample: boolean;
      sentAt: string;
    }>;
  }>;
  notificationSetting?: {
    subscribed?: boolean;
    focusAreaList?: any[];
    fundingStageList?: any[];
    roleList?: any[];
    technologyList?: any[];
    industryTagList?: any[];
    keywordList?: any[];
  };
  scheduleMeetingCount?: number;
  accessLevel: string;
}

export default function MembersWithRecommendationsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingRun, setIsCreatingRun] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      setIsLoading(true);
      const { plnadmin } = parseCookies();
      const config = {
        headers: {
          authorization: `Bearer ${plnadmin}`,
        },
      };
      const response = await api.get(`${API_ROUTE.ADMIN_RECOMMENDATIONS}/members-enabled`, config);
      setMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRun = async (memberUid: string) => {
    try {
      setIsCreatingRun(memberUid);
      const { plnadmin } = parseCookies();
      const config = {
        headers: {
          authorization: `Bearer ${plnadmin}`,
        },
      };
      const response = await api.post('/v1/admin/recommendations/runs', { targetMemberUid: memberUid }, config);
      router.push(`${ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS}/${response.data.uid}`);
    } catch (error) {
      console.error('Failed to create run:', error);
    } finally {
      setIsCreatingRun(null);
    }
  };

  return (
    <RecommendationsLayout activeTab="members">
      <div className="m-auto mt-6 h-[92%] max-w-[900px] overflow-y-auto bg-white p-6">
        {isLoading ? (
          <div>Loading...</div>
        ) : members.length === 0 ? (
          <div className="flex justify-center py-4">
            <span className="text-gray-500">No members with recommendations enabled</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-white">
                  <th className="py-3 text-left">Member</th>
                  <th className="py-3 text-left">Onboarding opt-in</th>
                  <th className="py-3 text-left">Settings opt-in</th>
                  <th className="py-3 text-left">Last Run</th>
                  <th className="py-3 text-left">Total Runs</th>
                  <th className="py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const recommendationRunsAsTarget = member.recommendationRunsAsTarget?.filter(
                    (run) =>
                      !run.emailNotifications || run.emailNotifications.every((notification) => !notification.isExample)
                  );
                  return (
                    <tr key={member.uid} className="border-b">
                      <td className="py-3">
                        <div className="flex items-center space-x-3">
                          {member.image?.url ? (
                            <img
                              src={member.image.url}
                              alt={member.name}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-lg font-medium text-gray-500">
                              {member.name.charAt(0)}
                            </div>
                          )}
                          <a
                            href={`${WEB_UI_BASE_URL}/members/${member.uid}`}
                            className="text-blue-600 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {member.name}
                          </a>
                        </div>
                      </td>
                      <td className="py-3">{member.notificationSetting?.subscribed ? 'Yes' : 'No'}</td>
                      <td className="py-3">
                        {(member.notificationSetting?.focusAreaList?.length ||
                          member.notificationSetting?.fundingStageList?.length ||
                          member.notificationSetting?.roleList?.length ||
                          member.notificationSetting?.technologyList?.length ||
                          member.notificationSetting?.industryTagList?.length ||
                          member.notificationSetting?.keywordList?.length) > 0
                          ? 'Yes'
                          : 'No'}
                      </td>
                      <td className="py-3">
                        {recommendationRunsAsTarget?.length > 0 ? (
                          <a
                            href={`${ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS}/${recommendationRunsAsTarget[0].uid}`}
                            className="text-blue-600 hover:underline"
                          >
                            {`${new Date(recommendationRunsAsTarget[0].createdAt).toLocaleDateString()} (${
                              recommendationRunsAsTarget[0].status
                            })`}
                          </a>
                        ) : (
                          'No runs'
                        )}
                      </td>
                      <td className="py-3">{recommendationRunsAsTarget?.length || 0}</td>
                      <td className="py-3">
                        <button
                          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                          onClick={() => handleCreateRun(member.uid)}
                          disabled={isCreatingRun === member.uid}
                        >
                          {isCreatingRun === member.uid ? 'Creating...' : 'Start Run'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RecommendationsLayout>
  );
}

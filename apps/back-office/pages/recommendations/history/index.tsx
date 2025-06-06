import { useState, useEffect } from 'react';
import { fetchRecommendationNotifications, RecommendationNotification } from '../../../utils/services/recommendations';
import APP_CONSTANTS from '../../../utils/constants';
import { RecommendationsLayout } from '../../../layout/recommendations-layout';
import { WEB_UI_BASE_URL } from '../../../utils/constants';
import { RecommendationDetailsModal } from '../../../components/recommendation-details-modal/recommendation-details-modal';

export default function RecommendationsHistory() {
  const [notifications, setNotifications] = useState<RecommendationNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<RecommendationNotification | null>(null);

  useEffect(() => {
    const loadNotifications = async () => {
      setIsLoading(true);
      const data = await fetchRecommendationNotifications();
      setNotifications(data);
      setIsLoading(false);
    };
    loadNotifications();
  }, []);

  return (
    <RecommendationsLayout activeTab="history">
      <div className="m-auto mt-6 h-[92%] max-w-[900px] overflow-y-auto bg-white p-6">
        {isLoading ? (
          <div>Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="flex justify-center py-4">
            <span className="text-gray-500">{APP_CONSTANTS.NO_DATA_AVAILABLE_LABEL}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-white">
                  <th className="py-3 text-left">Target Member</th>
                  <th className="py-3 text-left">Sent To</th>
                  <th className="py-3 text-left">Date</th>
                  <th className="py-3 text-left">Recommendations</th>
                  <th className="py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((notification) => (
                  <tr key={notification.id} className="cursor-pointer border-b">
                    <td className="py-3">
                      <a
                        href={`${WEB_UI_BASE_URL}/members/${notification.targetMember.uid}`}
                        className="text-blue-600 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {notification.targetMember.name}
                      </a>
                    </td>
                    <td className="py-3">{notification.email}</td>
                    <td className="py-3">
                      {new Date(notification.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3">{notification.recommendations.length}</td>
                    <td className="py-3 ">
                      <div className="flex space-x-2 ">
                        <button
                          className="whitespace-nowrap rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300"
                          onClick={() => setSelectedNotification(notification)}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedNotification && (
        <RecommendationDetailsModal
          isOpen={!!selectedNotification}
          onClose={() => setSelectedNotification(null)}
          notification={selectedNotification}
        />
      )}
    </RecommendationsLayout>
  );
}

import { Fragment } from 'react';
import Link from 'next/link';
import { Dialog, Transition } from '@headlessui/react';
import { RecommendationNotification } from '../../utils/services/recommendations';
import { ROUTE_CONSTANTS, WEB_UI_BASE_URL } from '../../utils/constants';

interface RecommendationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notification: RecommendationNotification;
}

export function RecommendationDetailsModal({ isOpen, onClose, notification }: RecommendationDetailsModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                  Recommendation Details
                </Dialog.Title>

                <div className="mt-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700">Run Id</h4>
                    <p className="text-gray-600">
                      <Link href={`${ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS}/${notification.recommendationRun.uid}`}>
                        <a className="text-blue-600 hover:underline">{notification.recommendationRun.uid}</a>
                      </Link>
                    </p>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700">Target Member</h4>
                    <a
                      href={`${WEB_UI_BASE_URL}/members/${notification.targetMember.uid}`}
                      className="text-blue-600 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {notification.targetMember.name}
                    </a>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700">Sent To</h4>
                    <p className="text-gray-600">{notification.email}</p>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700">Date</h4>
                    <p className="text-gray-600">
                      {new Date(notification.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700">Recommendations</h4>
                    <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-gray-300 p-4">
                      {notification.recommendations.map((recommendation) => (
                        <div
                          key={recommendation.uid}
                          className="mb-4 border-b border-gray-300 pb-4 last:border-0 last:pb-0"
                        >
                          <div>
                            <a
                              href={`${WEB_UI_BASE_URL}/members/${recommendation.recommendedMember.uid}`}
                              className="text-blue-600 hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {recommendation.recommendedMember.name}
                            </a>
                          </div>
                          <div className="text-sm text-gray-600">Score: {recommendation.score.toFixed(2)}</div>
                          <div className="text-sm text-gray-600">
                            Matches:{' '}
                            {[
                              recommendation.factors.roleMatch && 'Role Match',
                              recommendation.factors.teamFundingStage && 'Team Funding Stage',
                              recommendation.factors.teamTechnology && 'Team Technology',
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

import React from 'react';
import Modal from '../modal/modal';
import { DemoDayParticipant } from '../../screens/demo-days/types/demo-day';

interface ApplicationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: DemoDayParticipant | null;
}

export const ApplicationDetailsModal: React.FC<ApplicationDetailsModalProps> = ({ isOpen, onClose, participant }) => {
  if (!participant) return null;

  const member = participant.member;

  const investmentTeamRole = member?.teamMemberRoles?.find((memberRole) => memberRole.role);
  const organizationName = investmentTeamRole?.team?.name;
  const role = investmentTeamRole?.role;

  // Format LinkedIn URL
  const linkedinUrl = member?.linkedinHandler
    ? member.linkedinHandler.startsWith('http')
      ? member.linkedinHandler
      : `https://www.linkedin.com/in/${member.linkedinHandler}`
    : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Application Details</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-500">Name</label>
            <p className="mt-1 text-sm text-gray-900">{member?.name || participant.name || '-'}</p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-500">Email</label>
            <p className="mt-1 text-sm text-gray-900">{member?.email || participant.email || '-'}</p>
          </div>

          {/* LinkedIn Profile */}
          <div>
            <label className="block text-sm font-medium text-gray-500">LinkedIn Profile</label>
            {linkedinUrl ? (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
              >
                {member?.linkedinHandler}
                <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            ) : (
              <p className="mt-1 text-sm text-gray-400">-</p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-500">Role</label>
            <p className="mt-1 text-sm text-gray-900">{role || '-'}</p>
          </div>

          {/* Organisation / Fund Name */}
          <div>
            <label className="block text-sm font-medium text-gray-500">Organisation / Fund Name</label>
            <p className="mt-1 text-sm text-gray-900">{organizationName || '-'}</p>
          </div>

          {/* Accredited Investor */}
          <div>
            <label className="block text-sm font-medium text-gray-500">Accredited Investor</label>
            <p className="mt-1 text-sm">
              {member?.investorProfile?.secRulesAccepted ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Yes
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  No
                </span>
              )}
            </p>
          </div>

          {/* Application Date */}
          <div>
            <label className="block text-sm font-medium text-gray-500">Applied At</label>
            <p className="mt-1 text-sm text-gray-900">
              {participant.createdAt
                ? new Date(participant.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '-'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

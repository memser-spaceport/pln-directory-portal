import React from 'react';
import Modal from '../modal/modal';
import clsx from 'clsx';
import { DemoDayParticipant } from '../../screens/demo-days/types/demo-day';

interface ApproveParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: DemoDayParticipant | null;
  onApprove: (participantUid: string) => Promise<void>;
  isLoading?: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export const ApproveParticipantModal: React.FC<ApproveParticipantModalProps> = ({
  isOpen,
  onClose,
  participant,
  onApprove,
  isLoading = false,
}) => {
  const handleApprove = async () => {
    if (!participant) return;

    try {
      await onApprove(participant.uid);
      onClose();
    } catch (error) {
      console.error('Error approving participant:', error);
    }
  };

  if (!participant) return null;

  const member = participant.member;
  const displayName = member?.name || participant.name;
  const displayEmail = member?.email || participant.email;

  const investmentTeamRole = member?.teamMemberRoles?.find((r) => r.role);
  const fundOrOrgName = investmentTeamRole?.team?.name;

  const linkedinUrl = member?.linkedinHandler
    ? member.linkedinHandler.startsWith('http')
      ? member.linkedinHandler
      : `https://www.linkedin.com/in/${member.linkedinHandler}`
    : null;

  const inv = member?.investorProfile;
  const startupStages = inv?.investInStartupStages?.filter(Boolean);
  const investmentFocus = inv?.investmentFocus?.filter(Boolean);
  const checkSize = inv?.typicalCheckSize != null && inv.typicalCheckSize > 0 ? inv.typicalCheckSize : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Approve Application</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={isLoading}>
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className="mb-4 text-sm text-gray-600">
            You are about to approve this applicant as an <span className="font-medium text-gray-800">investor</span>{' '}
            participant. They will get access to the demo day investor experience.
          </p>

          <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Applicant</p>
            <p className="mt-1 font-medium text-gray-900">{displayName}</p>
            <p className="text-sm text-gray-600">{displayEmail}</p>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-800">Investor profile</h3>

            <div>
              <p className="text-xs font-medium text-gray-500">LinkedIn</p>
              {linkedinUrl ? (
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
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
                <p className="mt-0.5 text-sm text-gray-400">—</p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Fund / organization</p>
              <p className="mt-0.5 text-sm text-gray-900">{fundOrOrgName ?? '—'}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Startup stage(s)</p>
              <p className="mt-0.5 text-sm text-gray-900">
                {startupStages?.length ? startupStages.join(', ') : '—'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Typical check size</p>
              <p className="mt-0.5 text-sm text-gray-900">{checkSize != null ? formatCurrency(checkSize) : '—'}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Investment focus</p>
              <p className="mt-0.5 text-sm text-gray-900">
                {investmentFocus?.length ? investmentFocus.join(', ') : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={isLoading}
            className={clsx(
              'rounded-lg px-4 py-2 text-sm font-medium text-white',
              'bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? 'Approving...' : 'Approve'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

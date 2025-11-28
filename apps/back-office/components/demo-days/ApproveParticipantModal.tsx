import React, { useState } from 'react';
import Modal from '../modal/modal';
import clsx from 'clsx';

interface ApproveParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: {
    uid: string;
    name: string;
    email: string;
  } | null;
  onApprove: (participantUid: string, type: 'INVESTOR' | 'FOUNDER' | 'SUPPORT') => Promise<void>;
  isLoading?: boolean;
}

export const ApproveParticipantModal: React.FC<ApproveParticipantModalProps> = ({
  isOpen,
  onClose,
  participant,
  onApprove,
  isLoading = false,
}) => {
  const [selectedType, setSelectedType] = useState<'INVESTOR' | 'FOUNDER' | 'SUPPORT'>('INVESTOR');

  const handleApprove = async () => {
    if (!participant) return;

    try {
      await onApprove(participant.uid, selectedType);
      onClose();
    } catch (error) {
      console.error('Error approving participant:', error);
    }
  };

  const handleClose = () => {
    setSelectedType('INVESTOR');
    onClose();
  };

  if (!participant) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Approve Application</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isLoading}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-1">Applicant</p>
            <p className="font-medium text-gray-900">{participant.name}</p>
            <p className="text-sm text-gray-500">{participant.email}</p>
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Select Type <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="participantType"
                  value="INVESTOR"
                  checked={selectedType === 'INVESTOR'}
                  onChange={(e) => setSelectedType(e.target.value as 'INVESTOR' | 'FOUNDER' | 'SUPPORT')}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <span className="ml-2 text-sm text-gray-700">Investor</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="participantType"
                  value="FOUNDER"
                  checked={selectedType === 'FOUNDER'}
                  onChange={(e) => setSelectedType(e.target.value as 'INVESTOR' | 'FOUNDER' | 'SUPPORT')}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <span className="ml-2 text-sm text-gray-700">Founder</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="participantType"
                  value="SUPPORT"
                  checked={selectedType === 'SUPPORT'}
                  onChange={(e) => setSelectedType(e.target.value as 'INVESTOR' | 'FOUNDER' | 'SUPPORT')}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <span className="ml-2 text-sm text-gray-700">Support</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={handleClose}
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

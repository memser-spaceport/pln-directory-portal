import React, { ReactNode } from 'react';
import clsx from 'clsx';

import Modal from '../../modal/modal';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  participantName?: string;
  participantEmail?: string;
  details?: ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  isPending?: boolean;
  classes?: { confirmBtn?: string };
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = (props) => {
  const {
    isOpen,
    title,
    message,
    participantName,
    participantEmail,
    details,
    confirmLabel = 'Confirm',
    confirmDisabled = false,
    isPending = false,
    classes,
    onClose,
    onConfirm,
  } = props;

  const isConfirmBlocked = isPending || confirmDisabled;
  const confirmBtnClass = classes?.confirmBtn ?? 'bg-blue-600 hover:bg-blue-700';

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600">{message}</p>
          {(participantName || participantEmail) && (
            <dl className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              {participantName && (
                <div>
                  <dt className="font-medium text-gray-500">Name</dt>
                  <dd className="text-gray-900">{participantName}</dd>
                </div>
              )}
              {participantEmail && (
                <div>
                  <dt className="font-medium text-gray-500">Email</dt>
                  <dd className="break-all text-gray-900">{participantEmail}</dd>
                </div>
              )}
            </dl>
          )}
          {details && <div className="mt-3">{details}</div>}
        </div>
        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isConfirmBlocked}
              className={clsx(
                'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm',
                {
                  'cursor-not-allowed bg-gray-400': isConfirmBlocked,
                  [confirmBtnClass]: !isConfirmBlocked,
                }
              )}
            >
              {isPending ? 'Please wait...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

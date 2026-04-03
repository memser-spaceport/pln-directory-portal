import React from 'react';
import Modal from '../../../components/modal/modal';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  items?: string[];
}

export const InfoModal: React.FC<InfoModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  items,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="p-6">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-sm text-gray-500">{message}</p>
            {items && items.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {items.map((item, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default InfoModal;

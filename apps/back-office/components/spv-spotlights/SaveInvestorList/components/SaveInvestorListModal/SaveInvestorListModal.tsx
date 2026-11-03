import React, { FormEvent, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'react-toastify';

import { readApiErrorMessage } from '../../../utils/readApiErrorMessage';

import { useCreateSpvInvestorList } from '../../../../../hooks/spv-spotlights/useCreateSpvInvestorList';

import Modal from '../../../../modal/modal';

const FORM_ID = 'save-investor-list-form';
const NAME_MAX_LENGTH = 100;

interface SaveInvestorListModalProps {
  isOpen: boolean;
  spotlightUid: string;
  participantUids: string[];
  onClose: () => void;
}

export const SaveInvestorListModal: React.FC<SaveInvestorListModalProps> = (props) => {
  const { isOpen, spotlightUid, participantUids, onClose } = props;

  const { mutateAsync: createList, isLoading } = useCreateSpvInvestorList();

  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const isSubmitDisabled = isLoading || !name.trim();

  const handleClose = () => {
    setName('');
    setError('');
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitDisabled) return;
    try {
      const list = await createList({ spotlightUid, name: name.trim(), participantUids });
      const skippedCount = participantUids.length - list.emails.length;
      toast.success(
        skippedCount
          ? `List "${list.name}" saved. ${skippedCount} selected participant${
              skippedCount === 1 ? ' was' : 's were'
            } skipped: not an investor on this spotlight or no email`
          : `List "${list.name}" saved`
      );
      handleClose();
    } catch (err) {
      setError(readApiErrorMessage(err, 'Failed to save the list. Please try again.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Save Selected as a List</h3>
          <p className="mt-1 text-sm text-gray-500">
            {participantUids.length} selected investor{participantUids.length === 1 ? '' : 's'} will be saved
          </p>
        </div>
        <form id={FORM_ID} onSubmit={handleSubmit} className="px-6 py-4">
          <label htmlFor="investor-list-name" className="mb-2 block text-sm font-medium text-gray-700">
            List name <span className="text-red-500">*</span>
          </label>
          <input
            id="investor-list-name"
            type="text"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </form>
        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form={FORM_ID}
              disabled={isSubmitDisabled}
              className={clsx(
                'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm',
                isSubmitDisabled ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

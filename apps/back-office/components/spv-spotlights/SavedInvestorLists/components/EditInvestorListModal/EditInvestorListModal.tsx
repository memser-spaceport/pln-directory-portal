import React, { FormEvent, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'react-toastify';

import type { SpvInvestorList } from '../../../../../utils/services/spv-investor-lists';

import { readApiErrorMessage } from '../../../utils/readApiErrorMessage';

import { useUpdateSpvInvestorList } from '../../../../../hooks/spv-spotlights/useUpdateSpvInvestorList';

import Modal from '../../../../modal/modal';

const FORM_ID = 'edit-investor-list-form';
const NAME_MAX_LENGTH = 100;

interface EditInvestorListModalProps {
  spotlightUid: string;
  list: SpvInvestorList;
  availableEmails: ReadonlySet<string>;
  onDelete: () => void;
  onClose: () => void;
}

export const EditInvestorListModal: React.FC<EditInvestorListModalProps> = (props) => {
  const { spotlightUid, list, availableEmails, onDelete, onClose } = props;

  const { mutateAsync: updateList, isLoading } = useUpdateSpvInvestorList();

  const [name, setName] = useState(list.name);
  const [keptEmails, setKeptEmails] = useState(list.emails);
  const [error, setError] = useState('');

  const unavailableCount = keptEmails.filter((email) => !availableEmails.has(email)).length;
  const isEmpty = !keptEmails.length;
  const isSubmitDisabled = isLoading || !name.trim();

  const keepEmails = (isKept: (email: string) => boolean) => {
    setKeptEmails((prev) => prev.filter(isKept));
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitDisabled || isEmpty) return;
    try {
      const updated = await updateList({
        spotlightUid,
        listUid: list.uid,
        name: name.trim(),
        emails: keptEmails,
      });
      toast.success(`List "${updated.name}" saved`);
      onClose();
    } catch (err) {
      setError(readApiErrorMessage(err, 'Failed to save the list. Please try again.'));
    }
  };

  return (
    <Modal isOpen onClose={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Edit List</h3>
        </div>
        <form id={FORM_ID} onSubmit={handleSubmit} className="px-6 py-4">
          <label htmlFor="edit-investor-list-name" className="mb-2 block text-sm font-medium text-gray-700">
            List name <span className="text-red-500">*</span>
          </label>
          <input
            id="edit-investor-list-name"
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
          <p className="mb-2 mt-4 text-sm font-medium text-gray-700">Investors ({keptEmails.length})</p>
          {unavailableCount > 0 && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span>
                {unavailableCount} investor{unavailableCount === 1 ? ' is' : 's are'} no longer available on this
                spotlight. Remove {unavailableCount === 1 ? 'it' : 'them'} from the list?
              </span>
              <button
                type="button"
                onClick={() => keepEmails((email) => availableEmails.has(email))}
                className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1 text-amber-800 hover:bg-amber-100"
              >
                Remove all
              </button>
            </div>
          )}
          {isEmpty ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No investors left in the list. Delete the list instead?
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-gray-200 overflow-y-auto rounded-lg border border-gray-200">
              {keptEmails.map((email) => {
                const isAvailable = availableEmails.has(email);
                return (
                  <li key={email} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={clsx('truncate', { 'text-gray-900': isAvailable, 'text-gray-400': !isAvailable })}
                      >
                        {email}
                      </span>
                      {!isAvailable && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          Not available
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => keepEmails((keptEmail) => keptEmail !== email)}
                      className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </form>
        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            {isEmpty ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center rounded-lg border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
              >
                Delete List
              </button>
            ) : (
              <button
                type="submit"
                form={FORM_ID}
                disabled={isSubmitDisabled}
                className={clsx(
                  'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm',
                  {
                    'cursor-not-allowed bg-gray-400': isSubmitDisabled,
                    'bg-blue-600 hover:bg-blue-700': !isSubmitDisabled,
                  }
                )}
              >
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

import React, { useEffect, useState } from 'react';
import Modal from '../../../components/modal/modal';
import clsx from 'clsx';
import { AVAILABLE_SCOPES } from '../types';

interface EditScopesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (scopes: string[]) => void;
  title: string;
  currentScopes: string[];
  isLoading?: boolean;
}

export const EditScopesModal: React.FC<EditScopesModalProps> = ({
  isOpen,
  onClose,
  onSave,
  title,
  currentScopes,
  isLoading = false,
}) => {
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(currentScopes));

  useEffect(() => {
    if (isOpen) {
      setSelectedScopes(new Set(currentScopes));
    }
  }, [isOpen, currentScopes]);

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave([...selectedScopes].sort());
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full min-w-[400px] max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button type="button" onClick={onClose} className="text-gray-400 transition-colors hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <form id="edit-scopes-form" onSubmit={handleSubmit} className="space-y-3">
            <p className="text-sm text-gray-500 mb-4">
              Select which scopes this permission should have access to:
            </p>
            {AVAILABLE_SCOPES.map((scope) => (
              <label
                key={scope}
                className={clsx(
                  'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                  selectedScopes.has(scope)
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedScopes.has(scope)}
                  onChange={() => toggleScope(scope)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-900">{scope}</span>
              </label>
            ))}
          </form>
        </div>

        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-scopes-form"
              disabled={isLoading}
              className={clsx(
                'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                isLoading ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {isLoading ? 'Saving...' : 'Save Scopes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EditScopesModal;

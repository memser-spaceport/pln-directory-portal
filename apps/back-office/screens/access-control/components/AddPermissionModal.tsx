import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/modal/modal';
import clsx from 'clsx';
import { PermissionBasic, AVAILABLE_SCOPES } from '../types';
import { AccessControlSelect } from './AccessControlSelect';

interface AddPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (permission: PermissionBasic, scopes: string[]) => void;
  title: string;
  permissions: PermissionBasic[];
  isLoading?: boolean;
}

export const AddPermissionModal: React.FC<AddPermissionModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  title,
  permissions,
  isLoading = false,
}) => {
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) {
      setSelectedCode('');
      setSelectedScopes(new Set());
    }
  }, [isOpen]);

  const selectedPermission = permissions.find((p) => p.code === selectedCode) ?? null;
  const submitDisabled = isLoading || !selectedPermission;

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
    if (!selectedPermission) return;
    onAdd(selectedPermission, [...selectedScopes].sort());
    setSelectedCode('');
    setSelectedScopes(new Set());
    onClose();
  };

  const handleClose = () => {
    setSelectedCode('');
    setSelectedScopes(new Set());
    onClose();
  };

  const selectOptions = useMemo(
    () =>
      permissions.map((p) => ({
        value: p.code,
        name: p.code,
        desc: p.description?.trim() || undefined,
      })),
    [permissions]
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full min-w-[448px] max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button type="button" onClick={handleClose} className="text-gray-400 transition-colors hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <form id="add-permission-form" onSubmit={handleSubmit} className="space-y-4">
            <AccessControlSelect
              id="add-permission-select"
              label="Permission"
              required
              placeholder="Select a permission…"
              options={selectOptions}
              value={selectedCode}
              onChange={setSelectedCode}
              disabled={permissions.length === 0}
            />
            {permissions.length === 0 && (
              <p className="text-sm text-gray-500">This member already has every permission granted directly.</p>
            )}

            {selectedPermission && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Scopes (optional)</label>
                <div className="flex gap-3">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className={clsx(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm',
                        selectedScopes.has(scope)
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.has(scope)}
                        onChange={() => toggleScope(scope)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {scope}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-permission-form"
              disabled={submitDisabled}
              className={clsx(
                'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                submitDisabled ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {isLoading ? (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Adding…
                </>
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Permission
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AddPermissionModal;

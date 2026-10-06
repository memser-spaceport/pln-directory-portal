import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'react-toastify';

import Modal from '../modal/modal';
import { useAiAppResources } from '../../hooks/ai-app-resources/useAiAppResources';
import { useUpdateAiAppResources } from '../../hooks/ai-app-resources/useUpdateAiAppResources';
import { useResetAiAppResources } from '../../hooks/ai-app-resources/useResetAiAppResources';
import { AI_APP_RESOURCE_FIELDS } from '../../screens/ai-app-resources/constants';
import { AiAppResourceValues, AiAppTarget } from '../../screens/ai-app-resources/types';
import {
  getApiErrorMessage,
  hasEmptyResourceValue,
  isSameResourceValues,
  resourcesToForm,
  trimResourceValues,
} from '../../screens/ai-app-resources/utils';

interface EditAiAppResourcesModalProps {
  target: AiAppTarget | null;
  authToken: string | undefined;
  onClose: () => void;
}

export const EditAiAppResourcesModal: React.FC<EditAiAppResourcesModalProps> = ({ target, authToken, onClose }) => {
  const [form, setForm] = useState<AiAppResourceValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useAiAppResources({ authToken, target });
  const updateMutation = useUpdateAiAppResources();
  const resetMutation = useResetAiAppResources();

  const { values: loadedValues, isOverride } = resourcesToForm(data);
  const isBusy = updateMutation.isLoading || resetMutation.isLoading;
  const isUnchanged = !!form && isSameResourceValues(form, loadedValues);
  const saveDisabled = isBusy || isFetching || !form || isUnchanged;

  // Fill the form from the latest GET response (initial load, and again after save/reset).
  useEffect(() => {
    setForm(data ? resourcesToForm(data).values : null);
  }, [data]);

  useEffect(() => {
    setFormError(null);
    setConfirmReset(false);
  }, [target?.appId, target?.environment]);

  const handleClose = () => {
    if (isBusy) return;
    onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !form || saveDisabled) return;

    if (hasEmptyResourceValue(form)) {
      setFormError('All four fields are required.');
      return;
    }

    setFormError(null);
    try {
      await updateMutation.mutateAsync({ authToken, ...target, resources: trimResourceValues(form) });
      toast.success('Resources saved');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to save resources. Please try again.');
      setFormError(message);
      toast.error(message);
    }
  };

  const handleReset = async () => {
    if (!target || isBusy) return;

    setFormError(null);
    try {
      await resetMutation.mutateAsync({ authToken, ...target });
      setConfirmReset(false);
      toast.success('Resources reset to defaults');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to reset resources. Please try again.');
      setFormError(message);
      toast.error(message);
    }
  };

  return (
    <Modal isOpen={!!target} onClose={handleClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Edit resources</h3>
              {target && (
                <p className="text-sm text-gray-500">
                  {target.appId} · <span className="font-medium">{target.environment}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={handleClose}
              className="text-gray-400 transition-colors hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          {isLoading && <p className="text-sm text-gray-500">Loading resources...</p>}

          {isError && !data && (
            <div className="space-y-3">
              <p className="text-sm text-red-600">
                {getApiErrorMessage(error, 'Failed to load resources for this app.')}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Retry
              </button>
            </div>
          )}

          {data && form && (
            <form id="edit-ai-app-resources-form" onSubmit={handleSave} className="space-y-4">
              <div
                className={clsx(
                  'rounded-md px-3 py-2 text-sm',
                  isOverride ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-700'
                )}
              >
                {isOverride ? 'Custom resource override' : 'Using default resources'}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {AI_APP_RESOURCE_FIELDS.map((field) => (
                  <label key={field.key} className="block text-sm font-medium text-gray-700">
                    {field.label} <span className="text-red-500">*</span>
                    <input
                      type="text"
                      name={field.key}
                      value={form[field.key]}
                      placeholder={field.placeholder}
                      disabled={isBusy}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="mt-1 block text-xs font-normal text-gray-400">
                      Current: {loadedValues[field.key]}
                    </span>
                  </label>
                ))}
              </div>

              <p className="text-xs text-gray-500">
                Use Kubernetes quantities: CPU as 500m, 1, 2; memory as 512Mi, 1Gi. Requests must not be greater than
                limits.
              </p>

              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}

              {isOverride && confirmReset && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <p>Remove the custom override and use the default resources for this environment?</p>
                  <div className="mt-2 flex space-x-2">
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={isBusy}
                      className="rounded-lg bg-amber-600 px-3 py-1 text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {resetMutation.isLoading ? 'Resetting...' : 'Yes, reset'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      disabled={isBusy}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              {isOverride && !confirmReset && (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  disabled={isBusy || isFetching}
                  className="text-sm font-medium text-amber-700 hover:text-amber-800 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Reset to defaults
                </button>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isBusy}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="submit"
                form="edit-ai-app-resources-form"
                disabled={saveDisabled}
                className={clsx(
                  'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors',
                  saveDisabled ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                {updateMutation.isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EditAiAppResourcesModal;

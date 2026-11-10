import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'react-toastify';

import Modal from '../modal/modal';
import { useAiAppAudience } from '../../hooks/ai-app-resources/useAiAppAudience';
import { useUpdateAiAppAudience } from '../../hooks/ai-app-resources/useUpdateAiAppAudience';
import { usePoliciesList } from '../../hooks/access-control/usePoliciesList';
import {
  PolicyMultiSelect,
  PolicyOption,
} from '../../screens/members/components/MemberForm/RbacSection/PolicyMultiSelect/PolicyMultiSelect';
import { AI_APP_AUDIENCE_MEMBER_ROLES } from '../../screens/ai-app-resources/constants';
import {
  getApiErrorMessage,
  getAudienceConfirmMessage,
  getAudienceStatusLabel,
  isNotFoundError,
  isSamePolicyCodes,
} from '../../screens/ai-app-resources/utils';

interface EditAiAppAudienceModalProps {
  appId: string | null;
  authToken: string | undefined;
  onClose: () => void;
}

const SECONDARY_BUTTON =
  'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50';
const QUICK_ACTION =
  'text-sm font-medium text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400';

export const EditAiAppAudienceModal: React.FC<EditAiAppAudienceModalProps> = ({ appId, authToken, onClose }) => {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useAiAppAudience({ authToken, appId });
  const policies = usePoliciesList({ authToken, enabled: !!appId });
  const updateMutation = useUpdateAiAppAudience();

  const policyOptions = useMemo<PolicyOption[]>(
    () =>
      (policies.data ?? [])
        .filter((p) => p.role && p.group)
        .map((p) => ({ label: p.name, value: p.code, role: p.role, group: p.group })),
    [policies.data]
  );
  const selection = useMemo(() => {
    const labels = new Map(policyOptions.map((o) => [o.value, o.label]));
    return (codes ?? []).map((code) => ({ value: code, label: labels.get(code) ?? code }));
  }, [codes, policyOptions]);

  const isBusy = updateMutation.isLoading;
  const isNotTracked = isError && isNotFoundError(error);
  const isUnchanged = !!data && !!codes && isSamePolicyCodes(codes, data.policyCodes);
  const saveDisabled = isBusy || isFetching || !data || !codes || isUnchanged || confirmSave;
  const appName = data?.name || appId || '';

  // Fill the selection from the latest GET response (initial load, and again after save).
  useEffect(() => {
    setCodes(data ? data.policyCodes : null);
  }, [data]);

  useEffect(() => {
    setFormError(null);
    setConfirmSave(false);
  }, [appId]);

  const handleClose = () => {
    if (isBusy) return;
    onClose();
  };

  const changeCodes = (next: string[]) => {
    setCodes(next);
    setConfirmSave(false);
  };

  const selectAllMemberPolicies = () => {
    const memberCodes = policyOptions.filter((o) => AI_APP_AUDIENCE_MEMBER_ROLES.includes(o.role)).map((o) => o.value);
    changeCodes(Array.from(new Set([...(codes ?? []), ...memberCodes])));
  };

  const handleSave = async () => {
    if (!appId || !codes || isBusy) return;

    setFormError(null);
    try {
      await updateMutation.mutateAsync({ authToken, appId, policyCodes: codes });
      setConfirmSave(false);
      toast.success(codes.length > 0 ? 'Audience saved' : 'Access limited to PL Infra');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to save the audience. Please try again.');
      setConfirmSave(false);
      setFormError(message);
      toast.error(message);
    }
  };

  const renderBody = () => {
    if (isNotTracked) {
      return (
        <p className="text-sm text-gray-700">
          This app is not tracked by the Directory, so it cannot be opened to members.
        </p>
      );
    }

    if (isLoading || policies.isLoading) {
      return <p className="text-sm text-gray-500">Loading audience...</p>;
    }

    if ((isError && !data) || (policies.isError && !policies.data)) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-red-600">
            {isError
              ? getApiErrorMessage(error, 'Failed to load the audience for this app.')
              : getApiErrorMessage(policies.error, 'Failed to load policies.')}
          </p>
          <button type="button" onClick={() => (isError ? refetch() : policies.refetch())} className={SECONDARY_BUTTON}>
            Retry
          </button>
        </div>
      );
    }

    if (!data || !codes) return null;

    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Choose which members outside PL Infra can open this app. It also appears for them under More in LabOS. The
          deployment is not affected, and PL Infra members keep their access either way.
        </p>
        <div
          className={clsx(
            'rounded-md px-3 py-2 text-sm',
            data.policyCodes.length > 0 ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-700'
          )}
        >
          {getAudienceStatusLabel(data.policyCodes)}
        </div>

        {!data.directLinkGateReady && (
          <div
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            This app&apos;s deployed auth sidecar is too old to enforce per-app access. Members in the selected policies
            will be refused on the app until it is redeployed.
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span id="ai-app-audience-label" className="text-sm font-medium text-gray-700">
              Policies that can open this app
            </span>
            <span className="flex space-x-3">
              <button type="button" onClick={selectAllMemberPolicies} disabled={isBusy} className={QUICK_ACTION}>
                Select all member policies
              </button>
              <button
                type="button"
                onClick={() => changeCodes([])}
                disabled={isBusy || codes.length === 0}
                className={QUICK_ACTION}
              >
                Clear
              </button>
            </span>
          </div>
          <PolicyMultiSelect
            options={policyOptions}
            value={selection}
            onChange={(next) => changeCodes(next.map((v) => v.value))}
            isDisabled={isBusy}
            placeholder="No policies selected"
            ariaLabelledBy="ai-app-audience-label"
          />
          <p className="mt-1 text-xs text-gray-500">
            {codes.length} selected. An approved member who holds any selected policy can open the production app. Leave
            empty to keep it for PL Infra only.
          </p>
        </div>

        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}

        {confirmSave && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p>{getAudienceConfirmMessage(codes.length, appName)} This applies immediately.</p>
            <div className="mt-2 flex space-x-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isBusy}
                className="rounded-lg bg-amber-600 px-3 py-1 text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {isBusy ? 'Saving...' : 'Yes, save'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmSave(false)}
                disabled={isBusy}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal isOpen={!!appId} onClose={handleClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Audience</h3>
              {appId && <p className="text-sm text-gray-500">{data?.name ? `${data.name} · ${appId}` : appId}</p>}
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

        <div className="px-6 py-6">{renderBody()}</div>

        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isBusy}
              className={clsx('inline-flex items-center transition-colors', SECONDARY_BUTTON)}
            >
              Close
            </button>
            {!isNotTracked && (
              <button
                type="button"
                onClick={() => setConfirmSave(true)}
                disabled={saveDisabled}
                className={clsx(
                  'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors',
                  saveDisabled ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EditAiAppAudienceModal;

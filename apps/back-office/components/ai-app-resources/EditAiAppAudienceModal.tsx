import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import Select from 'react-select';
import { toast } from 'react-toastify';

import Modal from '../modal/modal';
import { useAiAppAudience } from '../../hooks/ai-app-resources/useAiAppAudience';
import { useUpdateAiAppAudience } from '../../hooks/ai-app-resources/useUpdateAiAppAudience';
import { useAccessControlPermissions } from '../../hooks/ai-app-resources/useAccessControlPermissions';
import { usePoliciesList } from '../../hooks/access-control/usePoliciesList';
import { useSearchMembers } from '../../hooks/access-control/useSearchMembers';
import {
  PolicyMultiSelect,
  PolicyOption,
} from '../../screens/members/components/MemberForm/RbacSection/PolicyMultiSelect/PolicyMultiSelect';
import { AI_APP_AUDIENCE_MEMBER_ROLES } from '../../screens/ai-app-resources/constants';
import type { AiAppAudienceSettings } from '../../screens/ai-app-resources/types';
import {
  getApiErrorMessage,
  getApiErrorStatus,
  getAppPathError,
  getAudienceConfirmMessage,
  getAudienceStatusLabel,
  isAudienceEmpty,
  isNotFoundError,
  isSameAudienceSettings,
} from '../../screens/ai-app-resources/utils';
import { uploadAiAppIcon } from '../../utils/services/ai-app-resources';

interface EditAiAppAudienceModalProps {
  appId: string | null;
  authToken: string | undefined;
  onClose: () => void;
}

const SECONDARY_BUTTON =
  'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50';
const QUICK_ACTION =
  'text-sm font-medium text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400';
const SECTION_TITLE = 'text-sm font-semibold text-gray-900';
const FIELD_LABEL = 'text-sm font-medium text-gray-700';
const HINT = 'mt-1 text-xs text-gray-500';
const ICON_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

type PermissionOption = { value: string; label: string };

function toSettings(data: AiAppAudienceSettings): AiAppAudienceSettings {
  return {
    policyCodes: data.policyCodes ?? [],
    permissionCodes: data.permissionCodes ?? [],
    members: data.members ?? [],
    showInMore: data.showInMore ?? true,
    path: data.path ?? null,
    iconUrl: data.iconUrl ?? null,
    hideTopNav: data.hideTopNav ?? false,
  };
}

/**
 * Back Office: who outside PL Infra can open an AI App (policies, permissions, members) and how LabOS shows it
 * (under More, path, icon, top navigation). LAB-3200, LAB-3237. Directory admins only; saves in one request.
 */
export const EditAiAppAudienceModal: React.FC<EditAiAppAudienceModalProps> = ({ appId, authToken, onClose }) => {
  const [form, setForm] = useState<AiAppAudienceSettings | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pathServerError, setPathServerError] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useAiAppAudience({ authToken, appId });
  const policies = usePoliciesList({ authToken, enabled: !!appId });
  const permissions = useAccessControlPermissions({ authToken, enabled: !!appId });
  const trimmedQuery = memberQuery.trim();
  const memberSearch = useSearchMembers({ authToken, query: trimmedQuery, enabled: trimmedQuery.length >= 2 });
  const updateMutation = useUpdateAiAppAudience();

  const policyOptions = useMemo<PolicyOption[]>(
    () =>
      (policies.data ?? [])
        .filter((p) => p.role && p.group)
        .map((p) => ({ label: p.name, value: p.code, role: p.role, group: p.group })),
    [policies.data]
  );
  const policySelection = useMemo(() => {
    const labels = new Map(policyOptions.map((o) => [o.value, o.label]));
    return (form?.policyCodes ?? []).map((code) => ({ value: code, label: labels.get(code) ?? code }));
  }, [form?.policyCodes, policyOptions]);

  const permissionOptions = useMemo<PermissionOption[]>(
    () =>
      (permissions.data ?? []).map((p) => ({
        value: p.code,
        label: p.description ? `${p.code} — ${p.description}` : p.code,
      })),
    [permissions.data]
  );
  const permissionSelection = useMemo(() => {
    const byCode = new Map(permissionOptions.map((o) => [o.value, o]));
    return (form?.permissionCodes ?? []).map((code) => byCode.get(code) ?? { value: code, label: code });
  }, [form?.permissionCodes, permissionOptions]);

  const memberResults = useMemo(() => {
    const picked = new Set((form?.members ?? []).map((m) => m.uid));
    return (memberSearch.data ?? []).filter((m) => !picked.has(m.uid)).slice(0, 8);
  }, [memberSearch.data, form?.members]);

  const pathError = form ? getAppPathError(form.path ?? '') : null;
  const isBusy = updateMutation.isLoading || isUploadingIcon;
  const isNotTracked = isError && isNotFoundError(error);
  const isUnchanged = !!data && !!form && isSameAudienceSettings(form, toSettings(data));
  const saveDisabled = isBusy || isFetching || !data || !form || isUnchanged || confirmSave || !!pathError;
  const appName = data?.name || appId || '';

  // Fill the form from the latest GET response (initial load, and again after save).
  useEffect(() => {
    setForm(data ? toSettings(data) : null);
  }, [data]);

  useEffect(() => {
    setFormError(null);
    setPathServerError(null);
    setConfirmSave(false);
    setMemberQuery('');
  }, [appId]);

  const handleClose = () => {
    if (isBusy) return;
    onClose();
  };

  const change = (patch: Partial<AiAppAudienceSettings>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setConfirmSave(false);
  };

  const selectAllMemberPolicies = () => {
    if (!form) return;
    const memberCodes = policyOptions.filter((o) => AI_APP_AUDIENCE_MEMBER_ROLES.includes(o.role)).map((o) => o.value);
    change({ policyCodes: Array.from(new Set([...form.policyCodes, ...memberCodes])) });
  };

  const handleIconFile = async (file: File | undefined) => {
    if (!file) return;
    setIsUploadingIcon(true);
    try {
      const url = await uploadAiAppIcon({ authToken, file });
      change({ iconUrl: url });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to upload the icon. Use a PNG, JPG, WebP or GIF image.'));
    } finally {
      setIsUploadingIcon(false);
      if (iconInput.current) iconInput.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!appId || !form || isBusy) return;

    setFormError(null);
    setPathServerError(null);
    try {
      await updateMutation.mutateAsync({
        authToken,
        appId,
        policyCodes: form.policyCodes,
        permissionCodes: form.permissionCodes,
        memberUids: form.members.map((m) => m.uid),
        showInMore: form.showInMore,
        path: form.path?.trim() ? form.path.trim() : null,
        iconUrl: form.iconUrl,
        hideTopNav: form.hideTopNav,
      });
      setConfirmSave(false);
      toast.success(isAudienceEmpty(form) ? 'Access limited to PL Infra' : 'Audience saved');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to save the audience. Please try again.');
      setConfirmSave(false);
      // 409 is only ever a path another app uses (the API's error filter keeps just status and message).
      if (getApiErrorStatus(err) === 409) {
        setPathServerError(message);
      } else {
        setFormError(message);
      }
      toast.error(message);
    }
  };

  const renderAudience = (settings: AiAppAudienceSettings) => (
    <section className="space-y-4">
      <h4 className={SECTION_TITLE}>Who can open this app</h4>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span id="ai-app-audience-label" className={FIELD_LABEL}>
            Policies that can open this app
          </span>
          <span className="flex space-x-3">
            <button type="button" onClick={selectAllMemberPolicies} disabled={isBusy} className={QUICK_ACTION}>
              Select all member policies
            </button>
            <button
              type="button"
              onClick={() => change({ policyCodes: [] })}
              disabled={isBusy || settings.policyCodes.length === 0}
              className={QUICK_ACTION}
            >
              Clear
            </button>
          </span>
        </div>
        <PolicyMultiSelect
          options={policyOptions}
          value={policySelection}
          onChange={(next) => change({ policyCodes: next.map((v) => v.value) })}
          isDisabled={isBusy}
          placeholder="No policies selected"
          ariaLabelledBy="ai-app-audience-label"
        />
        <p className={HINT}>{settings.policyCodes.length} selected. An approved member who holds any of them.</p>
      </div>

      <div>
        <label htmlFor="ai-app-audience-permissions" className={clsx('mb-1 block', FIELD_LABEL)}>
          Permissions that can open this app
        </label>
        <Select<PermissionOption, true>
          inputId="ai-app-audience-permissions"
          isMulti
          options={permissionOptions}
          value={permissionSelection}
          onChange={(next) => change({ permissionCodes: next.map((o) => o.value) })}
          isDisabled={isBusy}
          isLoading={permissions.isLoading}
          placeholder="No permissions selected"
          noOptionsMessage={() => (permissions.isError ? 'Failed to load permissions' : 'No permissions')}
          classNamePrefix="ai-app-permissions"
        />
        <p className={HINT}>
          An approved member who has any of them, through a policy or granted directly. For example a PLA permission for
          all PLA participants.
        </p>
      </div>

      <div>
        <label htmlFor="ai-app-audience-member-search" className={clsx('mb-1 block', FIELD_LABEL)}>
          Members who can open this app
        </label>
        {settings.members.length > 0 && (
          <ul className="mb-2 space-y-1" aria-label="Selected members">
            {settings.members.map((member) => (
              <li
                key={member.uid}
                className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1 text-sm"
              >
                <span>
                  {member.name}
                  {member.email && <span className="ml-2 text-gray-500">{member.email}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => change({ members: settings.members.filter((m) => m.uid !== member.uid) })}
                  disabled={isBusy}
                  className={QUICK_ACTION}
                  aria-label={`Remove ${member.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id="ai-app-audience-member-search"
          type="search"
          value={memberQuery}
          onChange={(e) => setMemberQuery(e.target.value)}
          disabled={isBusy}
          placeholder="Search members by name or email"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        {trimmedQuery.length >= 2 && (
          <ul
            className="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200"
            aria-label="Member search results"
          >
            {memberSearch.isLoading && <li className="px-3 py-2 text-sm text-gray-500">Searching...</li>}
            {!memberSearch.isLoading && memberResults.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">No members found</li>
            )}
            {memberResults.map((member) => (
              <li key={member.uid}>
                <button
                  type="button"
                  onClick={() => {
                    change({
                      members: [
                        ...settings.members,
                        { uid: member.uid, name: member.name, email: member.email ?? null },
                      ],
                    });
                    setMemberQuery('');
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  {member.name}
                  {member.email && <span className="ml-2 text-gray-500">{member.email}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className={HINT}>{settings.members.length} added. Only approved members can open the app.</p>
      </div>
    </section>
  );

  const renderLabos = (settings: AiAppAudienceSettings) => (
    <section className="space-y-4 border-t border-gray-200 pt-4">
      <h4 className={SECTION_TITLE}>In LabOS</h4>

      <label className="flex items-start space-x-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={settings.showInMore}
          onChange={(e) => change({ showInMore: e.target.checked })}
          disabled={isBusy}
          className="mt-1"
        />
        <span>
          Show under More
          <span className="block text-xs text-gray-500">
            When off, the app is not in the More menu. Its audience can still open it by its link.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="ai-app-path" className={clsx('mb-1 block', FIELD_LABEL)}>
          Path
        </label>
        <div className="flex items-center">
          <span className="rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
            /apps/
          </span>
          <input
            id="ai-app-path"
            type="text"
            value={settings.path ?? ''}
            onChange={(e) => {
              setPathServerError(null);
              change({ path: e.target.value.toLowerCase() });
            }}
            disabled={isBusy}
            placeholder={data?.appUid ?? ''}
            aria-invalid={!!(pathError || pathServerError)}
            className="w-full rounded-r-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        {(pathError || pathServerError) && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {pathError || pathServerError}
          </p>
        )}
        <p className={HINT}>A readable link, for example pla. Empty uses the app ID. The old link keeps working.</p>
      </div>

      <div>
        <span className={clsx('mb-1 block', FIELD_LABEL)}>Icon</span>
        <div className="flex items-center space-x-3">
          {settings.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.iconUrl}
              alt="App icon"
              className="h-10 w-10 rounded-md border border-gray-200 object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400">
              Star
            </span>
          )}
          <button type="button" onClick={() => iconInput.current?.click()} disabled={isBusy} className={QUICK_ACTION}>
            {isUploadingIcon ? 'Uploading...' : settings.iconUrl ? 'Replace icon' : 'Upload icon'}
          </button>
          {settings.iconUrl && (
            <button type="button" onClick={() => change({ iconUrl: null })} disabled={isBusy} className={QUICK_ACTION}>
              Remove icon
            </button>
          )}
          <input
            ref={iconInput}
            type="file"
            accept={ICON_TYPES}
            className="hidden"
            data-testid="ai-app-icon-input"
            onChange={(e) => handleIconFile(e.target.files?.[0])}
          />
        </div>
        <p className={HINT}>Shown in the More menu and on the AI Apps tile. Without an icon LabOS shows the star.</p>
      </div>

      <label className="flex items-start space-x-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={settings.hideTopNav}
          onChange={(e) => change({ hideTopNav: e.target.checked })}
          disabled={isBusy}
          className="mt-1"
        />
        <span>
          Hide top navigation
          <span className="block text-xs text-gray-500">
            The app opens full page in LabOS, without the LabOS header. Sign-in stays the same.
          </span>
        </span>
      </label>
    </section>
  );

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

    if (!data || !form) return null;

    const saved = toSettings(data);

    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Choose which members outside PL Infra can open this app, and how LabOS shows it. The deployment is not
          affected, and PL Infra members keep their access either way.
        </p>
        <div
          className={clsx(
            'rounded-md px-3 py-2 text-sm',
            isAudienceEmpty(saved) ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-800'
          )}
        >
          {getAudienceStatusLabel(saved)}
        </div>

        {!data.directLinkGateReady && (
          <div
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            This app&apos;s deployed auth sidecar is too old to enforce per-app access. Members in the selected audience
            will be refused on the app until it is redeployed.
          </div>
        )}

        {renderAudience(form)}
        {renderLabos(form)}

        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}

        {confirmSave && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p>{getAudienceConfirmMessage(form, appName)} This applies immediately.</p>
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
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
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

        <div className="overflow-y-auto px-6 py-6">{renderBody()}</div>

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

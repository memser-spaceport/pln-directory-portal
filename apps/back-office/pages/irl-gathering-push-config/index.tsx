import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';

import { ApprovalLayout } from '../../layout/approval-layout';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { useAuth } from '../../context/auth-context';
import { removeToken } from '../../utils/auth';

type IrlGatheringPushConfigDto = {
  uid: string;

  isActive: boolean;
  enabled: boolean;

  minAttendeesPerEvent: number;
  totalEventsThreshold: number;
  qualifiedEventsThreshold: number;
  upcomingWindowDays: number;
  reminderDaysBefore: number;

  updatedByMemberUid?: string | null;
  createdAt: string;
  updatedAt: string;
};

const IrlGatheringPushConfigPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { isDirectoryAdmin, isLoading, user } = useAuth();

  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string>('');
  const [successText, setSuccessText] = useState<string>('');

  const [config, setConfig] = useState<IrlGatheringPushConfigDto | null>(null);

  // local form state (editable)
  const [form, setForm] = useState({
    isActive: true,
    enabled: true,
    minAttendeesPerEvent: 5,
    totalEventsThreshold: 5,
    qualifiedEventsThreshold: 2,
    upcomingWindowDays: 7,
    reminderDaysBefore: 1,
  });

  const isDirty = useMemo(() => {
    if (!config) return false;
    return (
        form.isActive !== config.isActive ||
        form.enabled !== config.enabled ||
        Number(form.minAttendeesPerEvent) !== Number(config.minAttendeesPerEvent) ||
        Number(form.totalEventsThreshold) !== Number(config.totalEventsThreshold) ||
        Number(form.qualifiedEventsThreshold) !== Number(config.qualifiedEventsThreshold) ||
        Number(form.upcomingWindowDays) !== Number(config.upcomingWindowDays) ||
        Number(form.reminderDaysBefore) !== Number(config.reminderDaysBefore)
    );
  }, [config, form]);

  // Redirect to log-in if not authenticated
  useEffect(() => {
    if (!authToken) {
      router.replace(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  // Helper: logout when user has no roles (NONE) or forbidden
  const forceLogout = () => {
    console.log('[IrlGatheringPushConfigPage] Force logout (no roles / forbidden)');
    removeToken();
    document.cookie = 'plnadmin_user=; Max-Age=0; path=/;';
    router.replace('/');
  };

  // Redirect non-directory admins
  useEffect(() => {
    if (!isLoading && user) {
      const hasAnyRoles = Array.isArray((user as any).roles) && (user as any).roles.length > 0;

      if (!hasAnyRoles) {
        forceLogout();
        return;
      }

      if (!isDirectoryAdmin) {
        router.replace('/demo-days');
      }
    }
  }, [isLoading, user, isDirectoryAdmin, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load active config
  useEffect(() => {
    const load = async () => {
      if (!authToken) return;

      setIsLoadingConfig(true);
      setErrorText('');
      setSuccessText('');

      try {
        const res = await api.get(API_ROUTE.ADMIN_IRL_GATHERING_PUSH_CONFIG_ACTIVE, {
          headers: { authorization: `Bearer ${authToken}` },
        });

        const dto: IrlGatheringPushConfigDto | null = res?.data ?? null;
        setConfig(dto);

        if (dto) {
          setForm({
            isActive: Boolean(dto.isActive),
            enabled: Boolean(dto.enabled),
            minAttendeesPerEvent: Number(dto.minAttendeesPerEvent),
            totalEventsThreshold: Number(dto.totalEventsThreshold ?? 5),
            qualifiedEventsThreshold: Number(dto.qualifiedEventsThreshold ?? 2),
            upcomingWindowDays: Number(dto.upcomingWindowDays),
            reminderDaysBefore: Number(dto.reminderDaysBefore),
          });
        }
      } catch (e: any) {
        console.error('[IrlGatheringPushConfigPage] Failed to load config:', e);

        if (e?.response?.status === 403) {
          forceLogout();
          return;
        }

        setErrorText(e?.response?.data?.message || e?.message || 'Failed to load config');
      } finally {
        setIsLoadingConfig(false);
      }
    };

    // don’t call until auth loaded and user is allowed
    if (!isLoading && user && isDirectoryAdmin) {
      load();
    }
  }, [authToken, isLoading, user, isDirectoryAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = (name: string, value: any) => {
    setSuccessText('');
    setErrorText('');
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;

    setIsSaving(true);
    setErrorText('');
    setSuccessText('');

    try {
      if (!config?.uid) {
        setErrorText('Config is missing (no uid). Seed it in DB first.');
        return;
      }

      const payload = {
        isActive: Boolean(form.isActive),
        enabled: Boolean(form.enabled),
        minAttendeesPerEvent: Number(form.minAttendeesPerEvent),
        totalEventsThreshold: Number(form.totalEventsThreshold),
        qualifiedEventsThreshold: Number(form.qualifiedEventsThreshold),
        upcomingWindowDays: Number(form.upcomingWindowDays),
        reminderDaysBefore: Number(form.reminderDaysBefore),
      };

      const res = await api.patch(`${API_ROUTE.ADMIN_IRL_GATHERING_PUSH_CONFIG}/${config.uid}`, payload, {
        headers: { authorization: `Bearer ${authToken}` },
      });

      const updated: IrlGatheringPushConfigDto = res.data;
      setConfig(updated);

      // sync form with server response
      setForm({
        isActive: Boolean(updated.isActive),
        enabled: Boolean(updated.enabled),
        minAttendeesPerEvent: Number(updated.minAttendeesPerEvent),
        totalEventsThreshold: Number(updated.totalEventsThreshold ?? 5),
        qualifiedEventsThreshold: Number(updated.qualifiedEventsThreshold ?? 2),
        upcomingWindowDays: Number(updated.upcomingWindowDays),
        reminderDaysBefore: Number(updated.reminderDaysBefore),
      });

      setSuccessText('Saved');
    } catch (e: any) {
      console.error('[IrlGatheringPushConfigPage] Save failed:', e);

      if (e?.response?.status === 403) {
        forceLogout();
        return;
      }

      setErrorText(e?.response?.data?.message || e?.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  // Don't render page content if user doesn't have access
  if (!authToken || (!isLoading && user && !isDirectoryAdmin)) {
    return null;
  }

  return (
      <ApprovalLayout>
        <div className="mx-auto max-w-2xl p-6">
          <div className="mb-6">
            <button onClick={() => router.back()} className="mb-4 text-blue-600 hover:text-blue-800">
              ← Back
            </button>

            <h1 className="text-3xl font-semibold text-gray-900">IRL Push Config</h1>
            <p className="mt-1 text-sm text-gray-600">
              Controls thresholds and time windows for IRL gathering push notifications.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-sm">
            {isLoadingConfig ? (
                <div className="text-sm text-gray-600">Loading…</div>
            ) : (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-2 text-sm text-gray-700">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Config UID</span>
                      <span className="font-medium">{config?.uid || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Updated</span>
                      <span className="font-medium">
                    {config?.updatedAt ? new Date(config.updatedAt).toLocaleString() : '—'}
                  </span>
                    </div>
                  </div>

                  {errorText ? <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorText}</div> : null}
                  {successText ? (
                      <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{successText}</div>
                  ) : null}

                  {!config ? (
                      <div className="text-sm text-gray-600">
                        No active config found. Seed a row in DB (isActive=true), then reload.
                      </div>
                  ) : (
                      <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-1 gap-4">
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                                disabled={true}
                                type="checkbox"
                                checked={form.isActive}
                                onChange={(e) => updateField('isActive', e.target.checked)}
                            />
                            <span>
️isActive (this record is used by the job)</span>
                          </label>

                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={form.enabled}
                                onChange={(e) => updateField('enabled', e.target.checked)}
                            />
                            <span>enabled (turn notifications on/off)</span>
                          </label>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">minAttendeesPerEvent</label>
                            <input
                                type="number"
                                value={form.minAttendeesPerEvent}
                                onChange={(e) => updateField('minAttendeesPerEvent', e.target.valueAsNumber)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                min={0}
                            />
                            <p className="mt-1 text-xs text-gray-500">Minimum guests required per event to become a candidate.</p>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">totalEventsThreshold</label>
                            <input
                              type="number"
                              value={form.totalEventsThreshold}
                              onChange={(e) => updateField('totalEventsThreshold', e.target.valueAsNumber)}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              min={0}
                            />
                            <p className="mt-1 text-xs text-gray-500">Send (or refresh) a location push only when there are at least N total events in the upcoming window.</p>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">qualifiedEventsThreshold</label>
                            <input
                              type="number"
                              value={form.qualifiedEventsThreshold}
                              onChange={(e) => updateField('qualifiedEventsThreshold', e.target.valueAsNumber)}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              min={0}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Out of total events, how many must qualify by attendee + time filters.
                            </p>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">upcomingWindowDays</label>
                            <input
                                type="number"
                                value={form.upcomingWindowDays}
                                onChange={(e) => updateField('upcomingWindowDays', e.target.valueAsNumber)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                min={0}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Upcoming notifications only for events starting within N days.
                            </p>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">reminderDaysBefore</label>
                            <input
                                type="number"
                                value={form.reminderDaysBefore}
                                onChange={(e) => updateField('reminderDaysBefore', e.target.valueAsNumber)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                min={0}
                            />
                            <p className="mt-1 text-xs text-gray-500">Reminder window: event starts within N days.</p>
                          </div>
                        </div>

                        <div className="flex justify-end space-x-4">
                          <button
                              type="button"
                              onClick={() => {
                                if (!config) return;
                                setForm({
                                  isActive: Boolean(config.isActive),
                                  enabled: Boolean(config.enabled),
                                  minAttendeesPerEvent: Number(config.minAttendeesPerEvent),
                                  totalEventsThreshold: Number((config as any).totalEventsThreshold ?? 5),
                                  qualifiedEventsThreshold: Number((config as any).qualifiedEventsThreshold ?? 2),
                                  upcomingWindowDays: Number(config.upcomingWindowDays),
                                  reminderDaysBefore: Number(config.reminderDaysBefore),
                                });
                                setErrorText('');
                                setSuccessText('');
                              }}
                              disabled={isSaving || !isDirty}
                              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reset
                          </button>

                          <button
                              type="submit"
                              disabled={isSaving || !isDirty}
                              className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </form>
                  )}
                </>
            )}
          </div>
        </div>
      </ApprovalLayout>
  );
};

export default IrlGatheringPushConfigPage;

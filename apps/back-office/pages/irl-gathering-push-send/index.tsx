import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';

import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { removeToken } from '../../utils/auth';
import {
  fetchIrlGatheringLocations,
  IrlGatheringLocationDto,
  triggerIrlGatheringPush,
} from '../../utils/services/irlGatheringPushNotifications';

type PushKind = 'UPCOMING' | 'REMINDER';

const IrlGatheringPushSendPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { isDirectoryAdmin, isLoading, user } = useAuth();

  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string>('');
  const [successText, setSuccessText] = useState<string>('');

  const [locations, setLocations] = useState<IrlGatheringLocationDto[]>([]);
  const [locationUid, setLocationUid] = useState<string>('');

  useEffect(() => {
    if (!authToken) {
      router.replace(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  const forceLogout = () => {
    console.log('[IrlGatheringPushSendPage] Force logout (no roles / forbidden)');
    removeToken();
    document.cookie = 'plnadmin_user=; Max-Age=0; path=/;';
    router.replace('/');
  };

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

  useEffect(() => {
    const load = async () => {
      if (!authToken) return;
      setIsLoadingLocations(true);
      setErrorText('');

      try {
        const items = await fetchIrlGatheringLocations(authToken);
        setLocations(items);
        if (!locationUid && items?.[0]?.uid) {
          setLocationUid(items[0].uid);
        }
      } catch (e: any) {
        console.error('[IrlGatheringPushSendPage] Failed to load locations:', e);

        if (e?.response?.status === 403) {
          forceLogout();
          return;
        }

        setErrorText(e?.response?.data?.message || e?.message || 'Failed to load locations');
      } finally {
        setIsLoadingLocations(false);
      }
    };

    if (!isLoading && user && isDirectoryAdmin) {
      load();
    }
  }, [authToken, isLoading, user, isDirectoryAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLocation = useMemo(
    () => locations.find((l) => l.uid === locationUid) ?? null,
    [locations, locationUid]
  );

  const send = async (kind: PushKind) => {
    if (!authToken) return;
    if (!locationUid) return;

    setErrorText('');
    setSuccessText('');
    setIsSending(true);

    try {
      await triggerIrlGatheringPush({ locationUid, kind }, authToken);
      setSuccessText(`Triggered ${kind} for ${selectedLocation?.location ?? locationUid}`);
    } catch (e: any) {
      console.error('[IrlGatheringPushSendPage] Trigger failed:', e);

      if (e?.response?.status === 403) {
        forceLogout();
        return;
      }

      setErrorText(e?.response?.data?.message || e?.message || 'Trigger failed');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-[800px] p-8">
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">IRL Gathering — Send Push</h1>
        <p className="mb-6 text-sm text-gray-600">
          Manually trigger a push notification. The system recalculates events and attendees at the time of trigger.
        </p>

        {errorText ? <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorText}</div> : null}
        {successText ? (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{successText}</div>
        ) : null}

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Location</label>
            <select
              value={locationUid}
              onChange={(e) => setLocationUid(e.target.value)}
              disabled={isLoadingLocations || isSending}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {locations.map((l) => (
                <option key={l.uid} value={l.uid}>
                  {l.location}{l.country ? ` (${l.country})` : ''}
                </option>
              ))}
            </select>
            {isLoadingLocations ? <p className="mt-2 text-xs text-gray-500">Loading locations…</p> : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => send('UPCOMING')}
              disabled={!locationUid || isSending || isLoadingLocations}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send Announcement
            </button>

            <button
              type="button"
              onClick={() => send('REMINDER')}
              disabled={!locationUid || isSending || isLoadingLocations}
              className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send Reminder
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Announcement vs Reminder currently differs by copy (future: countdown logic).
          </p>
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default IrlGatheringPushSendPage;

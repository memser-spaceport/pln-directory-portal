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

/**
 * We intentionally make some nested fields optional in the UI type
 * because backend may evolve / return partial results during rollout.
 * UI should never crash on missing fields.
 */
type IrlPushTriggerResult =
  | {
  ok: true;
  action: 'created' | 'updated';
  pushUid?: string;
  ruleKind?: PushKind;
  locationUid?: string;
  payloadVersion?: number;
  candidates?: { total?: number; processed?: number };
  events?: { total?: number; eventUids?: string[]; dates?: { start?: string | null; end?: string | null } };
  attendees?: { total?: number; topAttendees?: number };
  updatedAt?: string;
  // allow backend to add fields without breaking UI
  [k: string]: any;
}
  | {
  ok: false;
  action: 'skipped';
  reason?:
    | 'no_active_config'
    | 'config_disabled'
    | 'no_events_in_window'
    | 'no_candidates'
    | 'window_miss'
    | 'thresholds_not_met'
    | string;
  ruleKind?: PushKind;
  locationUid?: string;
  details?: any;
  [k: string]: any;
};

const SKIP_REASON_LABEL: Record<string, string> = {
  no_active_config: 'No active config',
  config_disabled: 'Config is disabled',
  no_events_in_window: 'No events found in the configured window',
  no_candidates: 'No candidates generated',
  window_miss: 'Outside time window (job gating)',
  thresholds_not_met: 'Thresholds not met',
};

const SKIP_REASON_HELP: Record<string, string> = {
  no_active_config: 'Create/activate an IRL push config first.',
  config_disabled: 'Enable the active config to allow sending.',
  no_events_in_window: 'Try increasing upcomingWindowDays or adjust event dates.',
  no_candidates: 'Check minAttendeesPerEvent and confirm events have guests.',
  window_miss: 'This is a job gating condition. Admin trigger can bypass gating if enabled.',
  thresholds_not_met: 'Lower thresholds or add more qualifying events/attendees.',
};

function TriggerResultCard({ result }: { result: IrlPushTriggerResult }) {
  const [open, setOpen] = useState(false);

  if (!result) return null;

  if (result.ok) {
    const action = result.action ?? 'updated';
    const badge = action === 'created' ? '✅ Created' : '🔄 Updated';

    const eventsTotal = result.events?.total ?? 0;
    const attendeesTotal = result.attendees?.total ?? 0;
    const candidatesTotal = result.candidates?.total ?? 0;

    const updatedAtText = result.updatedAt ? new Date(result.updatedAt).toLocaleString() : '—';

    const eventUids = result.events?.eventUids ?? [];
    const datesStart = result.events?.dates?.start ?? null;
    const datesEnd = result.events?.dates?.end ?? null;

    const pushUid = result.pushUid ?? '—';
    const topAttendees = result.attendees?.topAttendees ?? 0;
    const payloadVersion = result.payloadVersion ?? 1;
    const ruleKind = result.ruleKind ?? 'UPCOMING';

    return (
      <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{badge} IRL push</span>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
              {ruleKind}
            </span>
          </div>

          <button type="button" className="text-xs font-semibold underline" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide details' : 'Show details'}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div>
            <div className="text-xs text-green-700">Events</div>
            <div className="font-semibold">{eventsTotal}</div>
          </div>
          <div>
            <div className="text-xs text-green-700">Attendees</div>
            <div className="font-semibold">{attendeesTotal}</div>
          </div>
          <div>
            <div className="text-xs text-green-700">Candidates</div>
            <div className="font-semibold">{candidatesTotal}</div>
          </div>
          <div>
            <div className="text-xs text-green-700">Updated</div>
            <div className="font-semibold">{updatedAtText}</div>
          </div>
        </div>

        <div className="mt-2">
          <div className="text-xs text-green-700">pushUid</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-white/60 px-2 py-1 text-xs">{pushUid}</code>
            {pushUid !== '—' ? (
              <button
                type="button"
                className="text-xs font-semibold underline"
                onClick={() => navigator.clipboard.writeText(pushUid)}
              >
                Copy
              </button>
            ) : null}
          </div>
        </div>

        {open ? (
          <div className="mt-4">
            <div className="rounded bg-white/60 p-3 text-xs">
              <div className="font-semibold">Dates</div>
              <div className="mt-1">
                {datesStart ?? '—'} → {datesEnd ?? '—'}
              </div>

              <div className="mt-3 font-semibold">Event UIDs</div>
              {eventUids.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {eventUids.map((id) => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1">—</div>
              )}

              <div className="mt-3">
                <span className="font-semibold">Top attendees shown:</span> {topAttendees}
              </div>

              <div className="mt-2">
                <span className="font-semibold">Payload version:</span> {payloadVersion}
              </div>
            </div>

            {/* ✅ Contrast RAW response (same as skipped) */}
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Raw response</div>
              <pre className="max-h-[420px] overflow-auto rounded-lg border border-gray-300 bg-gray-900 p-4 text-xs text-gray-100 shadow-inner font-mono">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ✅ Explicitly narrow union to skipped branch
  const skipped = result as Extract<IrlPushTriggerResult, { ok: false }>;
  const reasonCode = skipped.reason ?? 'unknown';
  const label = SKIP_REASON_LABEL[reasonCode] ?? reasonCode;
  const help = SKIP_REASON_HELP[reasonCode] ?? 'Check config, window and thresholds.';

  const ruleKind = skipped.ruleKind ?? 'UPCOMING';

  return (
    <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">⚠️ Skipped</span>
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
            {ruleKind}
          </span>
        </div>

        <button type="button" className="text-xs font-semibold underline" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide details' : 'Show details'}
        </button>
      </div>

      <div className="mt-2">
        <div className="text-xs text-yellow-700">Reason</div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-red-700">{label}</span>
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-mono text-red-800">{reasonCode}</span>
        </div>

        <div className="mt-1 text-xs text-yellow-800">{help}</div>
      </div>

      {open ? (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Raw response</div>
          <pre className="max-h-[420px] overflow-auto rounded-lg border border-gray-300 bg-gray-900 p-4 text-xs text-gray-100 shadow-inner font-mono">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

const IrlGatheringPushSendPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { isDirectoryAdmin, isLoading, user } = useAuth();

  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string>('');

  const [locations, setLocations] = useState<IrlGatheringLocationDto[]>([]);
  const [locationUid, setLocationUid] = useState<string>('');

  const [lastResult, setLastResult] = useState<IrlPushTriggerResult | null>(null);

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
      setLastResult(null);

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
    setLastResult(null);
    setIsSending(true);

    try {
      const res = (await triggerIrlGatheringPush({ locationUid, kind }, authToken)) as IrlPushTriggerResult;
      setLastResult(res);
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
        {lastResult ? <TriggerResultCard result={lastResult} /> : null}

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
                  {l.location}
                  {l.country ? ` (${l.country})` : ''}
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
            {selectedLocation ? (
              <>
                <br />
                Selected: <span className="font-semibold">{selectedLocation.location}</span>{' '}
                {selectedLocation.country ? `(${selectedLocation.country})` : ''}
              </>
            ) : null}
          </p>
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default IrlGatheringPushSendPage;

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import clsx from 'clsx';

import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { useAiAppsList } from '../../hooks/ai-app-resources/useAiAppsList';
import { EditAiAppResourcesModal } from '../../components/ai-app-resources/EditAiAppResourcesModal';
import { AiAppDeployment, AiAppTarget } from '../../screens/ai-app-resources/types';
import { canManageAiAppResources, getApiErrorMessage, getHostUrl } from '../../screens/ai-app-resources/utils';

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  error: 'bg-red-100 text-red-800',
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const StatusBadge = ({ status }: { status: string | null }) => (
  <span
    className={clsx(
      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
      (status && STATUS_STYLES[status.toLowerCase()]) || 'bg-gray-100 text-gray-700'
    )}
  >
    {status || 'unknown'}
  </span>
);

const AiAppResourcesPage = () => {
  const router = useRouter();
  const { hasPermission, isLoading } = useAuth();
  const [authToken] = useCookie('plnadmin');
  const [editTarget, setEditTarget] = useState<AiAppTarget | null>(null);

  const canManage = canManageAiAppResources(hasPermission);

  const {
    data: apps,
    isLoading: appsLoading,
    isError,
    error,
    refetch,
  } = useAiAppsList({
    authToken,
    enabled: canManage,
  });

  useEffect(() => {
    if (!authToken) {
      router.push(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (authToken && !isLoading && !canManage) {
      router.replace('/access-denied');
    }
  }, [authToken, isLoading, canManage, router]);

  if (!canManage) {
    return null;
  }

  const renderBody = () => {
    if (appsLoading) {
      return <div className="px-4 py-8 text-center text-sm text-gray-500">Loading AI Apps...</div>;
    }

    if (isError) {
      return (
        <div className="space-y-3 px-4 py-8 text-center">
          <p className="text-sm text-red-600">{getApiErrorMessage(error, 'Failed to load AI Apps.')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      );
    }

    if (!apps || apps.length === 0) {
      return <div className="px-4 py-8 text-center text-sm text-gray-500">No AI Apps yet</div>;
    }

    return (
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3">App ID</th>
            <th className="px-4 py-3">Environment</th>
            <th className="px-4 py-3">Release</th>
            <th className="px-4 py-3">Host</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Last updated</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {apps.map((app: AiAppDeployment) => {
            const hostUrl = getHostUrl(app.host);
            return (
              <tr key={`${app.app_id}:${app.environment}`} className="align-top">
                <td className="px-4 py-3 font-medium text-gray-900">{app.app_id}</td>
                <td className="px-4 py-3">{app.environment}</td>
                <td className="px-4 py-3">
                  <div>{app.release_name || '—'}</div>
                  {app.deployment_id && <div className="text-xs text-gray-400">Deployment {app.deployment_id}</div>}
                </td>
                <td className="px-4 py-3">
                  {hostUrl ? (
                    <a
                      href={hostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {app.host}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={app.status} />
                  {app.error && (
                    <details className="mt-1 max-w-xs text-xs text-red-700">
                      <summary className="cursor-pointer">View error</summary>
                      <p className="mt-1 whitespace-pre-wrap break-words">{app.error}</p>
                    </details>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDate(app.updated_at)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setEditTarget({ appId: app.app_id, environment: app.environment })}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit resources
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">AI Apps Resources</h1>
          <p className="text-sm text-gray-500">
            Set CPU and memory for each AI App environment. Apps without an override use the default resources.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">{renderBody()}</div>
      </div>
      <EditAiAppResourcesModal target={editTarget} authToken={authToken} onClose={() => setEditTarget(null)} />
    </ApprovalLayout>
  );
};

export default AiAppResourcesPage;

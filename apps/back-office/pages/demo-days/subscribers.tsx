import React, { useEffect, useState, useMemo } from 'react';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useDemoDaySubscribers } from '../../hooks/demo-days/useDemoDaySubscribers';
import { useCookie } from 'react-use';
import { useAuth } from '../../context/auth-context';
import { removeToken } from '../../utils/auth';
import { WEB_UI_BASE_URL } from '../../utils/constants';

const DemoDaySubscribersPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { user, isDirectoryAdmin, isDemoDayAdmin, isLoading } = useAuth();
  const { data: subscribers, isLoading: isSubscribersLoading } = useDemoDaySubscribers({ authToken });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!authToken) {
      router.replace(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (!isLoading && authToken && user && (!user.roles || user.roles.length === 0)) {
      removeToken();
      router.replace('/');
    }
  }, [authToken, user, isLoading, router]);

  useEffect(() => {
    if (!isLoading && authToken && user && user.roles && user.roles.length > 0) {
      if (!isDirectoryAdmin && !isDemoDayAdmin) {
        router.replace('/');
      }
    }
  }, [authToken, user, isLoading, isDirectoryAdmin, isDemoDayAdmin, router]);

  const filteredSubscribers = useMemo(() => {
    if (!subscribers) return [];
    if (!searchQuery.trim()) return subscribers;

    const query = searchQuery.toLowerCase();
    return subscribers.filter((subscriber) => {
      const email = subscriber.email?.toLowerCase() || '';
      return email.includes(query);
    });
  }, [subscribers, searchQuery]);

  const exportToCSV = () => {
    if (!filteredSubscribers || filteredSubscribers.length === 0) return;

    const headers = ['Email'];
    const rows = filteredSubscribers.map((subscriber) => [subscriber.email || '']);

    const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `demo-day-subscribers-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!authToken || isLoading) {
    return null;
  }

  if (user && (!user.roles || user.roles.length === 0)) {
    return null;
  }

  if (!isDirectoryAdmin && !isDemoDayAdmin) {
    return null;
  }

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-gray-900">Demo Day Subscribers</h1>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            />
          </div>
          <button
            onClick={exportToCSV}
            disabled={!filteredSubscribers || filteredSubscribers.length === 0}
            className="rounded-lg bg-green-600 px-4 py-2 text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            Export CSV
          </button>
        </div>

        {isSubscribersLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : !subscribers || subscribers.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
            No subscribers found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Member
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Subscribed At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                      No subscribers match your search.
                    </td>
                  </tr>
                ) : (
                  filteredSubscribers.map((subscriber, index) => (
                    <tr key={subscriber.email || index} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{subscriber.email || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {subscriber.memberId ? (
                          <a
                            href={`${WEB_UI_BASE_URL}/members/${subscriber.memberId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {subscriber.memberId}
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {subscriber.createdAt
                          ? new Date(subscriber.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {filteredSubscribers && filteredSubscribers.length > 0 && (
          <div className="mt-4 text-sm text-gray-500">
            Showing {filteredSubscribers.length} of {subscribers?.length || 0} subscribers
          </div>
        )}
      </div>
    </ApprovalLayout>
  );
};

export default DemoDaySubscribersPage;

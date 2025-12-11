import React, { useEffect } from 'react';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useDemoDaysList } from '../../hooks/demo-days/useDemoDaysList';
import { useCookie } from 'react-use';
import Link from 'next/link';
import { useAuth } from '../../context/auth-context';
import { removeToken } from '../../utils/auth';

const DemoDaysPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { user, isDirectoryAdmin, isDemoDayAdmin, isLoading } = useAuth();
  const { data: demoDays, isLoading: isDemoDaysLoading } = useDemoDaysList({ authToken });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authToken) {
      router.replace(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  // Logout completely if user has NO roles (NONE case)
  useEffect(() => {
    if (!isLoading && authToken && user && (!user.roles || user.roles.length === 0)) {
      removeToken();
      router.replace('/');
    }
  }, [authToken, user, isLoading, router]);

  // Block access to Demo Days if user has no required role
  useEffect(() => {
    if (!isLoading && authToken && user && user.roles && user.roles.length > 0) {
      if (!isDirectoryAdmin && !isDemoDayAdmin) {
        router.replace('/');
      }
    }
  }, [authToken, user, isLoading, isDirectoryAdmin, isDemoDayAdmin, router]);

  if (!authToken || isLoading) {
    return null;
  }

  if (user && (!user.roles || user.roles.length === 0)) {
    return null;
  }

  if (!isDirectoryAdmin && !isDemoDayAdmin) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-green-600 bg-green-100';
      case 'REGISTRATION_OPEN':
        return 'text-blue-600 bg-blue-100';
      case 'CLOSED':
        return 'text-red-600 bg-red-100';
      case 'DRAFT':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-gray-900">Demo Days</h1>
          {isDirectoryAdmin && (
            <button
              onClick={() => router.push('/demo-days/create')}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Create New Demo Day
            </button>
          )}
        </div>

        {isDemoDaysLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : !demoDays || demoDays.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
            No Demo Days found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Date
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Status
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">View</span>
                </th>
              </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {demoDays.map((demoDay) => (
                  <tr key={demoDay.uid} className="cursor-pointer hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{demoDay.title}</div>
                      <div
                        className="line-clamp-2 max-w-md text-sm text-gray-500 [&>p]:inline"
                        dangerouslySetInnerHTML={{
                          __html: demoDay.shortDescription || demoDay.description || '',
                        }}
                      />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">{formatDate(demoDay.startDate)}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">{formatDate(demoDay.endDate)}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(
                          demoDay.status
                        )}`}
                      >
                        {demoDay.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                      <Link href={`/demo-days/${demoDay.slugURL}`}>
                        <a className="text-blue-600 hover:text-blue-900">View Details</a>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ApprovalLayout>
  );
};

export default DemoDaysPage;

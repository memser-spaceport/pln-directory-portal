import React from 'react';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useDemoDaysList } from '../../hooks/demo-days/useDemoDaysList';
import { useCookie } from 'react-use';
import Link from 'next/link';

const DemoDaysPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { data: demoDays, isLoading } = useDemoDaysList({ authToken });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-green-600 bg-green-100';
      case 'UPCOMING':
        return 'text-yellow-600 bg-yellow-100';
      case 'COMPLETED':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-gray-900">Demo Days</h1>
          <button
            onClick={() => router.push('/demo-days/create')}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            Create New Demo Day
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading demo days...</div>
          </div>
        ) : !demoDays || demoDays.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 text-gray-500">No demo days found</div>
            <button
              onClick={() => router.push('/demo-days/create')}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              Create Your First Demo Day
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Start Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {demoDays.map((demoDay) => (
                  <tr key={demoDay.uid} className="cursor-pointer hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{demoDay.title}</div>
                      <div className="text-sm text-gray-500">{demoDay.description}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">{formatDate(demoDay.startDate)}</div>
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
                      <Link href={`/demo-days/${demoDay.uid}`}>
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

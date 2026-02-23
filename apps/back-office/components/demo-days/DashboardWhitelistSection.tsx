import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { useDashboardWhitelist, DashboardWhitelistMember } from '../../hooks/demo-days/useDashboardWhitelist';
import { useRemoveDashboardWhitelistMember } from '../../hooks/demo-days/useRemoveDashboardWhitelistMember';
import { AddDashboardWhitelistModal } from './AddDashboardWhitelistModal';
import clsx from 'clsx';
import { toast } from 'react-toastify';

interface DashboardWhitelistSectionProps {
  demoDayUid: string;
  authToken: string | undefined;
}

export const DashboardWhitelistSection: React.FC<DashboardWhitelistSectionProps> = ({ demoDayUid, authToken }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [memberToRemove, setMemberToRemove] = useState<DashboardWhitelistMember | null>(null);

  const { data: whitelist, isLoading } = useDashboardWhitelist({
    authToken,
    demoDayUid,
  });

  const removeMutation = useRemoveDashboardWhitelistMember();

  const filteredWhitelist = useMemo(() => {
    if (!whitelist) return [];
    if (!searchTerm) return whitelist;

    const lowerSearch = searchTerm.toLowerCase();
    return whitelist.filter(
      (item) =>
        item.member.name?.toLowerCase().includes(lowerSearch) ||
        item.member.email.toLowerCase().includes(lowerSearch)
    );
  }, [whitelist, searchTerm]);

  const existingMemberUids = useMemo(() => {
    return whitelist?.map((item) => item.memberUid) || [];
  }, [whitelist]);

  const handleRemove = async (member: DashboardWhitelistMember) => {
    if (!authToken) return;

    try {
      await removeMutation.mutateAsync({
        authToken,
        demoDayUid,
        memberUid: member.memberUid,
      });
      toast.success(`${member.member.name || member.member.email} removed from whitelist`);
      setMemberToRemove(null);
    } catch (error) {
      console.error('Error removing member from whitelist:', error);
      toast.error('Failed to remove member from whitelist. Please try again.');
    }
  };

  const getParticipantTypeColor = (type: string) => {
    switch (type) {
      case 'INVESTOR':
        return 'bg-purple-100 text-purple-800';
      case 'FOUNDER':
        return 'bg-blue-100 text-blue-800';
      case 'SUPPORT':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getParticipantStatusColor = (status: string) => {
    switch (status) {
      case 'ENABLED':
        return 'bg-green-100 text-green-800';
      case 'INVITED':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'DISABLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Dashboard Whitelist</h3>
            <p className="mt-1 text-sm text-gray-500">
              Members who can access the Founders Dashboard analytics for this Demo Day.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Member
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-gray-200 px-6 py-3">
        <div className="relative max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by name or email"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-gray-500">Loading whitelist...</div>
        ) : !whitelist || whitelist.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <p className="mt-2">No members in whitelist</p>
            <p className="text-sm text-gray-400">Add members to grant them dashboard access</p>
          </div>
        ) : filteredWhitelist.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <p>No members match your search</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Participant Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredWhitelist.map((item) => (
                <tr key={item.memberUid} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      {item.member.imageUrl ? (
                        <Image
                          className="h-8 w-8 rounded-full"
                          src={item.member.imageUrl}
                          alt=""
                          width={32}
                          height={32}
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                          <span className="text-sm font-medium text-gray-600">
                            {item.member.name?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                      )}
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{item.member.name || 'N/A'}</div>
                        <div className="text-sm text-gray-500">{item.member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {item.teamName || <span className="text-gray-400">-</span>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                        getParticipantTypeColor(item.participantType)
                      )}
                    >
                      {item.participantType === 'NONE' ? 'N/A' : item.participantType}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                        getParticipantStatusColor(item.participantStatus)
                      )}
                    >
                      {item.participantStatus === 'NONE' ? 'N/A' : item.participantStatus}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <button
                      onClick={() => setMemberToRemove(item)}
                      disabled={removeMutation.isPending}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with count */}
      {whitelist && whitelist.length > 0 && (
        <div className="border-t border-gray-200 px-6 py-3 text-sm text-gray-500">
          Showing {filteredWhitelist.length} of {whitelist.length} member{whitelist.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Add Modal */}
      <AddDashboardWhitelistModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        demoDayUid={demoDayUid}
        existingMemberUids={existingMemberUids}
      />

      {/* Remove Confirmation Modal */}
      {memberToRemove && (
        <div className="fixed inset-0 z-[1058] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center px-4 text-center">
            <div
              className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
              onClick={() => setMemberToRemove(null)}
            />

            <div className="relative inline-block w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left shadow-xl transition-all">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Remove from Whitelist</h3>
              </div>

              <p className="text-sm text-gray-500">
                Are you sure you want to remove{' '}
                <strong>{memberToRemove.member.name || memberToRemove.member.email}</strong> from the dashboard
                whitelist?
                {memberToRemove.participantType === 'FOUNDER' && memberToRemove.participantStatus === 'ENABLED' ? (
                  <span className="mt-2 block text-gray-400">
                    Note: As an enabled founder, they will still have access to their team&apos;s dashboard.
                  </span>
                ) : (
                  <span className="mt-2 block">
                    They will no longer be able to access the Founders Dashboard for this Demo Day.
                  </span>
                )}
              </p>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  onClick={() => setMemberToRemove(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  onClick={() => handleRemove(memberToRemove)}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

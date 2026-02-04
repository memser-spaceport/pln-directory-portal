import React, { useState } from 'react';
import Modal from '../modal/modal';
import { useMembersList } from '../../hooks/members/useMembersList';
import { useCookie } from 'react-use';
import { useAddDashboardWhitelistMember } from '../../hooks/demo-days/useAddDashboardWhitelistMember';
import clsx from 'clsx';
import { toast } from 'react-toastify';

interface AddDashboardWhitelistModalProps {
  isOpen: boolean;
  onClose: () => void;
  demoDayUid: string;
  existingMemberUids: string[];
}

export const AddDashboardWhitelistModal: React.FC<AddDashboardWhitelistModalProps> = ({
  isOpen,
  onClose,
  demoDayUid,
  existingMemberUids,
}) => {
  const [authToken] = useCookie('plnadmin');
  const [selectedMemberUid, setSelectedMemberUid] = useState<string>('');
  const [memberSearch, setMemberSearch] = useState('');

  const { data: members } = useMembersList({
    authToken,
    accessLevel: ['L2', 'L3', 'L4', 'L5', 'L6'],
  });

  const addMutation = useAddDashboardWhitelistMember();

  // Filter members by search and exclude already whitelisted members
  const filteredMembers =
    members?.data?.filter(
      (member) =>
        !existingMemberUids.includes(member.uid) &&
        (member.name?.toLowerCase().includes(memberSearch?.toLowerCase()) ||
          member.email?.toLowerCase().includes(memberSearch?.toLowerCase()))
    ) || [];

  const submitDisabled = addMutation.isPending || !selectedMemberUid;

  const resetAll = () => {
    setSelectedMemberUid('');
    setMemberSearch('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authToken || !selectedMemberUid) return;

    try {
      await addMutation.mutateAsync({
        authToken,
        demoDayUid,
        memberUid: selectedMemberUid,
      });

      toast.success('Member added to dashboard whitelist');
      resetAll();
      onClose();
    } catch (error: any) {
      console.error('Error adding member to whitelist:', error);
      if (error?.response?.status === 409) {
        toast.error('Member is already whitelisted');
      } else {
        toast.error('Failed to add member to whitelist. Please try again.');
      }
    }
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Add Dashboard Whitelist Member</h3>
            <button onClick={handleClose} className="text-gray-400 transition-colors hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <form id="add-whitelist-member-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Search Member <span className="text-red-500">*</span>
              </label>
              <div className="relative">
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
                  placeholder="Search by name or email..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {memberSearch && (
                <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                  {filteredMembers.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {filteredMembers.slice(0, 50).map((member) => (
                        <div
                          key={member.uid}
                          onClick={() => setSelectedMemberUid(member.uid)}
                          className={clsx(
                            'cursor-pointer p-3 transition-colors',
                            selectedMemberUid === member.uid
                              ? 'border-l-4 border-blue-500 bg-blue-50'
                              : 'hover:bg-gray-50'
                          )}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                                <span className="text-sm font-medium text-gray-600">
                                  {member.name?.charAt(0).toUpperCase() || '?'}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{member.name}</p>
                              <p className="truncate text-sm text-gray-500">{member.email}</p>
                            </div>
                            {selectedMemberUid === member.uid && (
                              <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-gray-500">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <p className="mt-2 text-sm">No members found</p>
                      <p className="text-xs text-gray-400">Try adjusting your search terms</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-whitelist-member-form"
              disabled={submitDisabled}
              className={clsx(
                'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                submitDisabled ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {addMutation.isPending ? (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Adding...
                </>
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Member
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

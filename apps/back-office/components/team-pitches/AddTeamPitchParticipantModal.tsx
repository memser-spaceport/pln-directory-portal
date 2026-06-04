import React, { useEffect, useState } from 'react';
import Modal from '../modal/modal';
import { useMembersList } from '../../hooks/members/useMembersList';
import { useCookie } from 'react-use';
import { useAddTeamPitchParticipant } from '../../hooks/team-pitches/useAddTeamPitchParticipant';
import clsx from 'clsx';

type ParticipantTabType = 'INVESTOR' | 'FOUNDER' | 'SUPPORT';

interface AddTeamPitchParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  pitchUid: string;
  defaultType: ParticipantTabType;
  onAdded?: () => void;
}

export const AddTeamPitchParticipantModal: React.FC<AddTeamPitchParticipantModalProps> = ({
  isOpen,
  onClose,
  pitchUid,
  defaultType,
  onAdded,
}) => {
  const [authToken] = useCookie('plnadmin');
  const [participantType, setParticipantType] = useState<ParticipantTabType>(defaultType);
  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing');
  const [memberSearch, setMemberSearch] = useState('');
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState('');
  const [selectedMemberUid, setSelectedMemberUid] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  const addMutation = useAddTeamPitchParticipant();

  useEffect(() => {
    if (isOpen) {
      setParticipantType(defaultType);
    }
  }, [isOpen, defaultType]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedMemberSearch(memberSearch.trim()), 300);
    return () => window.clearTimeout(t);
  }, [memberSearch]);

  const { data: members } = useMembersList(
    {
      authToken,
      memberState: ['APPROVED', 'PENDING', 'VERIFIED'],
      page: 1,
      limit: 50,
      search: debouncedMemberSearch || undefined,
    },
    { enabled: !!authToken && isOpen && addMode === 'existing' }
  );

  const filteredMembers = members?.data ?? [];
  const submitDisabled =
    addMutation.isPending || (addMode === 'existing' ? !selectedMemberUid : !newEmail.trim() || !newName.trim());

  const resetAll = () => {
    setParticipantType(defaultType);
    setAddMode('existing');
    setMemberSearch('');
    setDebouncedMemberSearch('');
    setSelectedMemberUid('');
    setNewEmail('');
    setNewName('');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;

    const data =
      addMode === 'existing'
        ? { memberUid: selectedMemberUid, type: participantType }
        : { email: newEmail.trim(), name: newName.trim(), type: participantType };

    try {
      await addMutation.mutateAsync({ authToken, pitchUid, data });
      resetAll();
      onAdded?.();
      onClose();
    } catch {
      alert('Failed to add participant. Please try again.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Add Participant</h3>
            <button onClick={handleClose} className="text-gray-400 transition-colors hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <form id="add-team-pitch-participant-form" onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Participant Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['INVESTOR', 'FOUNDER', 'SUPPORT'] as const).map((type) => (
                  <label
                    key={type}
                    className={clsx(
                      'flex cursor-pointer items-center justify-center rounded-lg border px-4 py-3 transition-all',
                      participantType === type
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    )}
                  >
                    <input
                      type="radio"
                      value={type}
                      checked={participantType === type}
                      onChange={() => setParticipantType(type)}
                      className="sr-only"
                    />
                    <div className="flex items-center">
                      <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-current">
                        {participantType === type && <div className="h-2 w-2 rounded-full bg-current" />}
                      </div>
                      {type.charAt(0) + type.slice(1).toLowerCase()}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAddMode('existing')}
                className={clsx(
                  'rounded-lg border px-4 py-3 text-sm font-medium transition-all',
                  addMode === 'existing'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                )}
              >
                Existing member
              </button>
              <button
                type="button"
                onClick={() => setAddMode('new')}
                className={clsx(
                  'rounded-lg border px-4 py-3 text-sm font-medium transition-all',
                  addMode === 'new'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                )}
              >
                New member
              </button>
            </div>

            {addMode === 'existing' ? (
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
                        {filteredMembers.map((member) => (
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
                            <p className="text-sm font-medium text-gray-900">{member.name}</p>
                            <p className="text-sm text-gray-500">{member.email}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-sm text-gray-500">No members found</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="investor@example.com"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Full name"
                  />
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-team-pitch-participant-form"
              disabled={submitDisabled}
              className={clsx(
                'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm',
                submitDisabled ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {addMutation.isPending ? 'Adding...' : 'Add Participant'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

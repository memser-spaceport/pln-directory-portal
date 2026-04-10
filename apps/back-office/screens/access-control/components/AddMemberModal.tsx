import React, { useMemo, useState } from 'react';
import Modal from '../../../components/modal/modal';
import { useSearchMembers } from '../../../hooks/access-control/useSearchMembers';
import { useRbacMembers } from '../../../hooks/access-control/useRbacMembers';
import { useCookie } from 'react-use';
import clsx from 'clsx';
import { MemberBasic, TeamMemberRoleInfo, AVAILABLE_SCOPES } from '../types';

type MemberPickerRow = MemberBasic & { teamMemberRoles?: TeamMemberRoleInfo[] };

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (member: MemberPickerRow, scopes: string[]) => void;
  title: string;
  existingMemberUids?: string[];
  excludeRoleCode?: string;
  isLoading?: boolean;
  showScopes?: boolean;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  title,
  existingMemberUids = [],
  excludeRoleCode,
  isLoading = false,
  showScopes = false,
}) => {
  const [authToken] = useCookie('plnadmin');
  const [selectedMember, setSelectedMember] = useState<MemberPickerRow | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());

  const searchActive = memberSearch.trim().length >= 2;

  const { data: initialData, isFetching: isFetchingInitial } = useRbacMembers({
    authToken,
    page: 1,
    limit: 5,
    excludeRoleCode,
    enabled: isOpen && !!authToken,
  });

  const { data: searchMembers, isFetching: isSearchFetching } = useSearchMembers({
    authToken,
    query: memberSearch,
    limit: 20,
    enabled: isOpen && !!authToken && searchActive,
  });

  const existingSet = useMemo(() => new Set(existingMemberUids), [existingMemberUids]);

  const initialMembers = useMemo(() => {
    return initialData?.members ?? [];
  }, [initialData?.members]);

  const searchFiltered = useMemo(() => {
    const list = searchMembers ?? [];
    return list.filter((m) => !existingSet.has(m.uid));
  }, [searchMembers, existingSet]);

  const displayMembers = searchActive ? searchFiltered : initialMembers;
  const showSearchSpinner = searchActive && isSearchFetching;
  const showInitialLoading = !searchActive && isFetchingInitial && isOpen;

  const submitDisabled = isLoading || !selectedMember;

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  const resetAll = () => {
    setSelectedMember(null);
    setMemberSearch('');
    setSelectedScopes(new Set());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMember) return;

    onAdd(selectedMember, [...selectedScopes].sort());
    resetAll();
    onClose();
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button type="button" onClick={handleClose} className="text-gray-400 transition-colors hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="w-[500px] max-w-xl px-6 py-6">
          <form id="add-member-form" onSubmit={handleSubmit} className="space-y-4">
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
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setSelectedMember(null);
                  }}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-10 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
                {(showSearchSpinner || showInitialLoading) && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg className="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {displayMembers.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {displayMembers.map((member) => (
                      <div
                        key={member.uid}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedMember(member)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedMember(member);
                          }
                        }}
                        className={clsx(
                          'cursor-pointer p-3 transition-colors',
                          selectedMember?.uid === member.uid
                            ? 'border-l-4 border-blue-500 bg-blue-50'
                            : 'hover:bg-gray-50'
                        )}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                              {member.image?.url ? (
                                <img
                                  src={member.image.url}
                                  alt={member.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-sm font-medium text-gray-600">
                                  {member.name?.charAt(0).toUpperCase() || '?'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">{member.name}</p>
                            <p className="truncate text-sm text-gray-500">{member.email}</p>
                            {member.teamMemberRoles && member.teamMemberRoles.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {member.teamMemberRoles.map((tmr) => (
                                  <span
                                    key={tmr.team.uid}
                                    className="inline-flex max-w-full rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                                    title={tmr.role ? `${tmr.team.name} — ${tmr.role}` : tmr.team.name}
                                  >
                                    <span className="truncate">
                                      {tmr.team.name}
                                      {tmr.role ? ` · ${tmr.role}` : ''}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {selectedMember?.uid === member.uid && (
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
                    <p className="mt-2 text-sm">
                      {searchActive ? 'No members found' : 'No members available to add'}
                    </p>
                    {searchActive && <p className="text-xs text-gray-400">Try adjusting your search terms</p>}
                  </div>
                )}
              </div>
            </div>

            {showScopes && selectedMember && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Scopes (optional)</label>
                <div className="flex gap-3">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className={clsx(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm',
                        selectedScopes.has(scope)
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.has(scope)}
                        onChange={() => toggleScope(scope)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {scope}
                    </label>
                  ))}
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
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-member-form"
              disabled={submitDisabled}
              className={clsx(
                'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                submitDisabled ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {isLoading ? (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
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

export default AddMemberModal;

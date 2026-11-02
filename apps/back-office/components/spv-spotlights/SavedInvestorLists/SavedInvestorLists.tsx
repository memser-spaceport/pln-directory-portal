import React, { useState } from 'react';

import type { SpvInvestorList } from '../../../utils/services/spv-investor-lists';

import { useSpvInvestorLists } from '../../../hooks/spv-spotlights/useSpvInvestorLists';
import { useDeleteSpvInvestorList } from '../../../hooks/spv-spotlights/useDeleteSpvInvestorList';

import { ConfirmModal } from '../../common/ConfirmModal';

interface SavedInvestorListsProps {
  spotlightUid: string;
  onApply: (participantUids: string[]) => void;
}

export const SavedInvestorLists: React.FC<SavedInvestorListsProps> = (props) => {
  const { spotlightUid, onApply } = props;

  const { data: lists, isError } = useSpvInvestorLists(spotlightUid);
  const { mutate: deleteList, isLoading: isDeleting } = useDeleteSpvInvestorList();

  const [listToDelete, setListToDelete] = useState<SpvInvestorList | null>(null);

  const handleDelete = () => {
    if (!listToDelete) return;
    deleteList({ spotlightUid, listUid: listToDelete.uid }, { onSettled: () => setListToDelete(null) });
  };

  if (isError) {
    return <p className="mb-4 text-sm text-red-600">Failed to load saved lists</p>;
  }

  if (!lists?.length) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
            <th className="w-48 px-4 py-3 text-left font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {lists.map((list) => (
            <tr key={list.uid}>
              <td className="px-4 py-3 text-gray-900">{list.name}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onApply(list.participantUids)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setListToDelete(list)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmModal
        isOpen={!!listToDelete}
        title="Delete list"
        message={`Delete the list "${listToDelete?.name}"? The investors stay on the spotlight.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        classes={{ confirmBtn: 'bg-red-600 hover:bg-red-700' }}
        onClose={() => setListToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};

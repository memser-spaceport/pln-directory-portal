import React, { useState } from 'react';

import { SaveInvestorListModal } from './components/SaveInvestorListModal';

interface SaveInvestorListProps {
  spotlightUid: string;
  participantUids: string[];
}

export const SaveInvestorList: React.FC<SaveInvestorListProps> = (props) => {
  const { spotlightUid, participantUids } = props;

  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
      >
        Save Selected as a List
      </button>
      <SaveInvestorListModal
        isOpen={isModalOpen}
        spotlightUid={spotlightUid}
        participantUids={participantUids}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

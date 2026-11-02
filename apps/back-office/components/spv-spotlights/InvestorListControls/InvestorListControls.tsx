import React, { ComponentProps, useState } from 'react';

import { SelectSpvInvestorsModal } from '../SelectSpvInvestorsModal';

type InvestorListControlsProps = Pick<
  ComponentProps<typeof SelectSpvInvestorsModal>,
  'spotlightUid' | 'investors' | 'onSelect'
>;

export const InvestorListControls: React.FC<InvestorListControlsProps> = (props) => {
  const { spotlightUid, investors, onSelect } = props;

  const [isCsvSelectOpen, setIsCsvSelectOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsCsvSelectOpen(true)}
        className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
      >
        Select Members via CSV
      </button>
      <SelectSpvInvestorsModal
        isOpen={isCsvSelectOpen}
        spotlightUid={spotlightUid}
        investors={investors}
        onSelect={onSelect}
        onClose={() => setIsCsvSelectOpen(false)}
      />
    </>
  );
};

import React from 'react';

type TMissionHelpAreaProps = {
  areaIcon: React.ReactNode;
  areaName: string;
};

export const MissionHelpArea = ({
  areaIcon,
  areaName,
}: TMissionHelpAreaProps) => {
  return (
    <div className="flex items-center gap-x-3 text-left">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50">
        {areaIcon}
      </div>
      {areaName}
    </div>
  );
};

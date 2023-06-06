import React from 'react';

type TMissionHelpAreaProps = {
  index?: number;
  areaIcon: React.ReactNode;
  areaName: string;
};

export const MissionHelpArea = ({
  index,
  areaIcon,
  areaName,
}: TMissionHelpAreaProps) => {
  return (
    <div className={`flex items-center gap-x-3 text-left ${index === 5 ? ' col-span-2':''}`}>
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50">
        {areaIcon}
      </div>
      {areaName}
    </div>
  );
};

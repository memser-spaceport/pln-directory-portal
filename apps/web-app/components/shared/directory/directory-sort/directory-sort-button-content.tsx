import React from 'react';
import { IDirectorySortDropdownOption } from './directory-sort.types';

interface DirectorySortButtonContentProps {
  selectedOption: IDirectorySortDropdownOption;
}

export function DirectorySortButtonContent({
  selectedOption,
}: DirectorySortButtonContentProps) {
  const SortIcon = selectedOption.icon;

  return (
    <>
      <SortIcon className="pointer-events-none relative top-px mr-1 h-4" />
      <div className="leading-6 mr-2">{selectedOption.label}</div>
    </>
  );
}

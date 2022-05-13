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
      <SortIcon className="h-4 mr-1 top-px relative pointer-events-none" />
      <div className="leading-6">Sorted: {selectedOption.label}</div>
    </>
  );
}

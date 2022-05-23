import { ReactNode } from 'react';

interface DirectoryFilterProps {
  title: string;
  children: ReactNode;
}

export function DirectoryFilter({ title, children }: DirectoryFilterProps) {
  return (
    <>
      <div className="text-sm font-semibold leading-5 mb-4">{title}</div>
      <div>{children}</div>
    </>
  );
}

export default DirectoryFilter;

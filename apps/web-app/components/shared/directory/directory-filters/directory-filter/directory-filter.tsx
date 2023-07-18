import { ReactNode } from 'react';

interface DirectoryFilterProps {
  title: string;
  children: ReactNode;
}

export function DirectoryFilter({ title, children }: DirectoryFilterProps) {
  return (
    <>
      <div className='relative'>
      <div className="mb-4 text-sm font-semibold leading-5">{title}</div>
      <div>{children}</div>
      </div>
    </>
  );
}

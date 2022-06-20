import React from 'react';

export type DirectoryCardProps = { isGrid: boolean } & Pick<
  React.ComponentPropsWithoutRef<'div'>,
  'children'
>;

export function DirectoryCard({ isGrid, children }: DirectoryCardProps) {
  return (
    <div
      className={`flex rounded-lg border bg-white text-sm shadow-md  ${
        isGrid ? 'w-[260px] flex-col' : 'w-full flex-row flex-wrap'
      }`}
    >
      {children}
    </div>
  );
}

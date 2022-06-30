import React from 'react';

export type DirectoryCardProps = { isGrid: boolean } & Pick<
  React.ComponentPropsWithoutRef<'div'>,
  'children'
>;

export function DirectoryCard({ isGrid, children }: DirectoryCardProps) {
  return (
    <div
      className={`card flex  ${
        isGrid ? 'w-[295px] flex-col' : 'w-full flex-row flex-wrap'
      }`}
    >
      {children}
    </div>
  );
}

import React from 'react';

export type DirectoryCardProps = {
  isGrid?: boolean;
} & Pick<React.ComponentPropsWithoutRef<'div'>, 'children'>;

export function DirectoryCard({ isGrid, children }: DirectoryCardProps) {
  return (
    <div className="w-[260px] bg-white border rounded-lg shadow-md text-sm">
      {children}
    </div>
  );
}

export default DirectoryCard;

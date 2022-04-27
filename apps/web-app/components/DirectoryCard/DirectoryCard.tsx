import React from 'react';

export type DirectoryCardProps = {
  isGrid?: boolean;
} & Pick<React.ComponentPropsWithoutRef<'div'>, 'onClick' | 'children'>;

export function DirectoryCard({
  isGrid,
  onClick,
  children,
}: DirectoryCardProps) {
  return (
    <div
      className="bg-white border rounded-lg shadow-md text-sm px-6 pt-6 pb-4 min-w-[260px] cursor-pointer"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export default DirectoryCard;

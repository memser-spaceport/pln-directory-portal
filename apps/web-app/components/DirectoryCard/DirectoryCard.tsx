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
      className="w-[260px] bg-white border rounded-lg shadow-md text-sm  pb-4  cursor-pointer"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

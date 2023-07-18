import { AnchorLink } from '@protocol-labs-network/ui';
import React from 'react';

export type DirectoryCardProps = { isGrid: boolean; cardUrl: string,  handleOnClick?:any, type:string } & Pick<
  React.ComponentPropsWithoutRef<'div'>,
  'children'
>;

export function DirectoryCard({
  isGrid,
  cardUrl,
  children,
  handleOnClick,
  type
}: DirectoryCardProps) {
  return (
    <div
      className={`card p-0 ${
        isGrid ? 'w-[295px]' : 'w-full'
      } hover:shadow-on-hover relative`}
    >
      <AnchorLink handleOnClick={handleOnClick} href={cardUrl} linkClassName="block on-focus">
        <div
          className={`flex ${
            isGrid
              ? type === 'member' ? 'flex-col text-center w-full rounded-t-xl' : 'before:bg-gradient-to-b--white-to-slate-200 flex-col p-5 pb-4 text-center before:absolute before:left-0 before:top-0 before:h-16 before:w-full before:rounded-t-xl before:border-b before:border-slate-200'
              : 'flex-row flex-wrap space-x-4 p-5'
          }`}
        >
          {children}
        </div>
      </AnchorLink>
    </div>
  );
}

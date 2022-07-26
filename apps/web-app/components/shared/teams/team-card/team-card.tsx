import { UserGroupIcon } from '@heroicons/react/solid';
import { ITeam } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { DirectoryCard } from '../../../directory/directory-card/directory-card';
import { DirectoryCardFooter } from '../../../directory/directory-card/directory-card-footer';
import { DirectoryCardHeader } from '../../../directory/directory-card/directory-card-header';

export interface TeamCardProps {
  team: ITeam;
  isGrid?: boolean;
}

export function TeamCard({ team, isGrid = true }: TeamCardProps) {
  const router = useRouter();
  const backLink = encodeURIComponent(router.asPath);

  return (
    <DirectoryCard
      isGrid={isGrid}
      cardUrl={`/teams/${team.id}?backLink=${backLink}`}
    >
      <DirectoryCardHeader
        isGrid={isGrid}
        img={team.logo}
        avatarIcon={UserGroupIcon}
        name={team.name}
      />
      <div className={isGrid ? '' : 'w-[400px] grow-0'}>
        <h2 className={`${isGrid ? 'my-2' : ''} text-lg font-semibold`}>
          {team.name}
        </h2>
        <p
          className={`${
            isGrid ? 'line-clamp-3 h-[60px]' : 'line-clamp-2 mt-1'
          }  leading-5 text-slate-600`}
        >
          {team.shortDescription}
        </p>
      </div>
      <DirectoryCardFooter isGrid={isGrid} tagsArr={team.tags} />
    </DirectoryCard>
  );
}

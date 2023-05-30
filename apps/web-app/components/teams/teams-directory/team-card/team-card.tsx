import { UserGroupIcon } from '@heroicons/react/solid';
import { useRouter } from 'next/router';
import { ITeam } from '../../../../utils/teams.types';
import { DirectoryCard } from '../../../shared/directory/directory-card/directory-card';
import { DirectoryCardFooter } from '../../../shared/directory/directory-card/directory-card-footer';
import { DirectoryCardHeader } from '../../../shared/directory/directory-card/directory-card-header';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';

export interface TeamCardProps {
  team: ITeam;
  isGrid?: boolean;
}

export function TeamCard({ team, isGrid = true }: TeamCardProps) {
  const router = useRouter();
  const backLink = encodeURIComponent(router.asPath);

  const analytics = useAppAnalytics()

  const onTeamClicked = () => {
    analytics.captureEvent('team-clicked', {
      uid: team.id,
      name: team.name,
      backLink: backLink
    })
  }

  return (
    <DirectoryCard
      isGrid={isGrid}
      cardUrl={`/directory/teams/${team.id}?backLink=${backLink}`}
      handleOnClick={onTeamClicked}
    >
      <DirectoryCardHeader
        isGrid={isGrid}
        img={team.logo}
        avatarIcon={UserGroupIcon}
        name={team.name}
      />
      <div className={isGrid ? '' : 'w-[400px] grow-0'}>
        <h2
          className={`${
            isGrid ? 'my-2' : ''
          } line-clamp-1 text-lg font-semibold`}
        >
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
      <DirectoryCardFooter
        isGrid={isGrid}
        tagsArr={team.industryTags.map((tag) => tag.title)}
      />
    </DirectoryCard>
  );
}

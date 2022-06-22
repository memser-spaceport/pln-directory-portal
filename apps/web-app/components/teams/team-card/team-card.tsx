import { ITeam } from '@protocol-labs-network/api';
import { AnchorLink, Tags } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { DirectoryCard } from '../../directory/directory-card/directory-card';
import { SocialLinks } from '../../shared/social-links/social-links';

export interface TeamCardProps {
  team: ITeam;
  isGrid: boolean;
}

export function TeamCard({ team, isGrid }: TeamCardProps) {
  const router = useRouter();

  return (
    <DirectoryCard isGrid={isGrid}>
      <AnchorLink
        href={`/teams/${team.id}?backLink=${encodeURIComponent(router.asPath)}`}
      >
        <div
          className={`flex ${isGrid ? 'flex-col px-6 pt-6' : 'flex-row p-6'}`}
        >
          <div
            className={`h-24 rounded-lg ${
              team.logo ? 'bg-contain bg-center bg-no-repeat' : 'bg-slate-200'
            } ${isGrid ? 'mb-5 w-full' : 'mr-6 w-56'}`}
            style={{
              ...(team.logo && { backgroundImage: `url(${team.logo})` }),
            }}
          />
          <div className="w-52 grow-0">
            <h3 className="text-base font-semibold text-slate-900">
              {team.name}
            </h3>
            <p className="line-clamp-3 mt-0.5 h-16">{team.shortDescription}</p>
          </div>
        </div>
      </AnchorLink>

      <div
        className={`${
          !isGrid &&
          'flex flex-row sm:w-full lg:ml-auto lg:w-6/12 lg:justify-end'
        }`}
      >
        <div
          className={`flex h-[50px] ${
            isGrid ? 'px-6 pt-3' : 'ml-6 items-center self-center sm:w-6/12'
          }`}
        >
          {team.industry && team.industry.length ? (
            <Tags items={team.industry} />
          ) : (
            <span className="text-xs text-slate-400">
              Industry not provided
            </span>
          )}
        </div>
        <div
          className={`flex space-x-2 px-6 py-4 ${
            isGrid
              ? 'border-t border-slate-200'
              : 'sm:w-6/1 ml-6 items-center justify-center border-l border-slate-200 sm:flex-auto'
          }`}
        >
          <SocialLinks
            website={{ link: team.website }}
            twitter={{ link: team.twitter }}
          />
        </div>
      </div>
    </DirectoryCard>
  );
}

import { ITeam } from '@protocol-labs-network/api';
import { AnchorLink, Tags } from '@protocol-labs-network/ui';
import { DirectoryCard } from '../directory-card/directory-card';
import { SocialLinks } from '../social-links/social-links';

export interface TeamCardProps {
  team: ITeam;
  isGrid: boolean;
}

export function TeamCard({ team, isGrid }: TeamCardProps) {
  return (
    <DirectoryCard isGrid={isGrid}>
      <AnchorLink href={`/teams/${team.id}`}>
        <div
          className={`flex ${isGrid ? 'flex-col px-6 pt-6' : 'flex-row p-6'}`}
        >
          <div
            className={`h-24 rounded-lg ${
              team.logo ? 'bg-no-repeat bg-center bg-contain' : 'bg-slate-200'
            } ${isGrid ? 'w-full mb-5' : 'w-56 mr-6'}`}
            style={{
              ...(team.logo && { backgroundImage: `url(${team.logo})` }),
            }}
          />
          <div className="w-52 grow-0">
            <h3 className="text-base text-slate-900 font-semibold">
              {team.name}
            </h3>
            <p className="mt-0.5 h-16 line-clamp-3">{team.shortDescription}</p>
          </div>
        </div>
      </AnchorLink>

      <div
        className={`${
          !isGrid &&
          'sm:w-full lg:w-6/12 lg:ml-auto lg:justify-end flex flex-row'
        }`}
      >
        <div
          className={`h-[50px] flex ${
            isGrid ? 'px-6 pt-3' : 'ml-6 self-center items-center sm:w-6/12'
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
          className={`flex px-6 py-4 space-x-2 ${
            isGrid
              ? 'border-t border-slate-200'
              : 'ml-6 justify-center items-center border-l border-slate-200 sm:flex-auto sm:w-6/1'
          }`}
        >
          <SocialLinks website={team.website} twitter={team.twitter} />
        </div>
      </div>
    </DirectoryCard>
  );
}

import { ExternalLinkIcon } from '@heroicons/react/solid';
import { ITeam } from '@protocol-labs-network/api';
import { AnchorLink, Tags } from '@protocol-labs-network/ui';
import { DirectoryCard } from '../DirectoryCard/DirectoryCard';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';
export interface TeamCardProps {
  team: ITeam;
}

export function TeamCard({ team }: TeamCardProps) {
  const TEAM_CARD_LINKS_CLASSNAME = 'PLN-links';

  return (
    <DirectoryCard isGrid={true}>
      <AnchorLink href={`/teams/${team.id}`}>
        <div className="px-6 pt-6">
          <div
            className={`w-full h-24 rounded-lg mb-5 ${
              team.logo ? 'bg-no-repeat bg-center bg-contain' : 'bg-slate-200'
            } `}
            style={{
              ...(team.logo && { backgroundImage: `url(${team.logo})` }),
            }}
          />

          <h6 className="text-base text-slate-900 font-semibold">
            {team.name}
          </h6>

          <p className="mt-0.5 h-16 overflow-clip">{team.shortDescription}</p>
        </div>
      </AnchorLink>

      <div className="text-xs text-slate-400 font-medium px-6 pt-3 h-[50px] border-b border-slate-200">
        {team.industry.length ? (
          <Tags items={team.industry} />
        ) : (
          <span>Industry not provided</span>
        )}
      </div>

      <div className={`${TEAM_CARD_LINKS_CLASSNAME} flex px-6 py-4 space-x-2`}>
        {/**
         * TODO: Remove the website split when Airtable data gets fixed.
         *
         * It is necessary considering that there's one team on Airtable with
         * an invalid website value (`http://xpto.com/ http://otpx.com/`)
         * which needs to be parsed this way.
         */}
        <AnchorLink href={team.website?.split(' ')[0]}>
          <ExternalLinkIcon
            className={`w-5 h-5 ${
              team.website
                ? 'text-slate-500 hover:text-slate-900'
                : 'text-slate-300'
            }`}
          />
        </AnchorLink>

        <AnchorLink href={`https://twitter.com/${team.twitter}`}>
          <TwitterLogo
            className={`w-5 h-5 ${
              team.twitter
                ? 'text-slate-500 hover:text-slate-900'
                : 'text-slate-300'
            } `}
            title="Twitter"
          />
        </AnchorLink>
      </div>
    </DirectoryCard>
  );
}

export default TeamCard;

import { ExternalLinkIcon } from '@heroicons/react/solid';
import { AnchorLink, Tags } from '@protocol-labs-network/ui';
import { DirectoryCard } from '../DirectoryCard/DirectoryCard';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';
export interface TeamCardProps {
  isGrid: boolean;
  id?: string;
  name?: string;
  shortDescription?: string;
  twitter?: string;
  logo?: string;
  industry?: string[];
  website?: string;
}

export function TeamCard({
  isGrid,
  id,
  name,
  shortDescription,
  twitter,
  logo,
  industry,
  website,
}: TeamCardProps) {
  const TEAM_CARD_LINKS_CLASSNAME = 'PLN-links';

  return (
    <DirectoryCard isGrid={isGrid}>
      <AnchorLink href={`/teams/${id}`}>
        <div
          className={`flex ${isGrid ? 'flex-col px-6 pt-6' : 'flex-row p-6'} `}
        >
          <div
            className={`h-24 rounded-lg ${
              logo ? 'bg-no-repeat bg-center bg-contain' : 'bg-slate-200'
            } ${isGrid ? 'w-full mb-5' : 'w-56 mr-6'} `}
            style={{ backgroundImage: `url(${logo})` }}
          ></div>
          <div className="w-52 grow-0">
            <h6 className="text-base text-slate-900 font-semibold">{name}</h6>
            <p className="mt-0.5 h-16 overflow-clip">{shortDescription}</p>
          </div>
        </div>
      </AnchorLink>
      <div
        className={`${
          isGrid
            ? ''
            : 'sm:w-full lg:w-6/12 lg:ml-auto lg:justify-end flex flex-row '
        } `}
      >
        <div
          className={`text-xs text-slate-400 font-medium h-[50px] flex  ${
            isGrid ? 'px-6 pt-3' : 'ml-6 self-center items-center sm:w-6/12'
          } `}
        >
          {industry && industry.length ? (
            <Tags items={industry} />
          ) : (
            'Industry not Provided'
          )}
        </div>
        <div
          className={`${TEAM_CARD_LINKS_CLASSNAME} flex px-6 py-4 space-x-2 ${
            isGrid
              ? ' border-t border-slate-200'
              : 'ml-6 justify-center items-center border-l border-slate-200 sm:flex-auto sm:w-6/1 '
          }`}
        >
          <AnchorLink href={website}>
            <ExternalLinkIcon
              className={`w-5 h-5 ${
                website
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-300'
              }`}
            />
          </AnchorLink>
          <AnchorLink href={twitter}>
            <TwitterLogo
              className={`w-5 h-5 ${
                twitter
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-300'
              } `}
              title="Twitter Logo Icon"
            />
          </AnchorLink>
        </div>
      </div>
    </DirectoryCard>
  );
}

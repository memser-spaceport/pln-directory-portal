import { ExternalLinkIcon } from '@heroicons/react/solid';
import { AnchorLink, Tags } from '@protocol-labs-network/ui';
import { DirectoryCard } from '../DirectoryCard/DirectoryCard';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';
export interface TeamCardProps {
  id?: string;
  name?: string;
  shortDescription?: string;
  twitter?: string;
  logo?: string;
  industry?: string[];
  website?: string;
}

export function TeamCard({
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
    <DirectoryCard isGrid={true}>
      <AnchorLink href={`/teams/${id}`}>
        <div className="px-6 pt-6">
          <div
            className={`w-full h-24 rounded-lg mb-5 ${
              logo ? 'bg-no-repeat bg-center bg-contain' : 'bg-slate-200'
            } `}
            style={{ backgroundImage: `url(${logo})` }}
          ></div>

          <h6 className="text-base text-slate-900 font-semibold">{name}</h6>
          <p className="mt-0.5 h-16 overflow-clip">{shortDescription}</p>
        </div>
      </AnchorLink>

      <div className="text-xs text-slate-400 font-medium px-6 pt-3 h-[50px] border-b border-slate-200">
        {industry && industry.length ? (
          <Tags items={industry} />
        ) : (
          'Industry not Provided'
        )}
      </div>
      <div className={`${TEAM_CARD_LINKS_CLASSNAME} flex px-6 py-4 space-x-2`}>
        <AnchorLink href={website}>
          <ExternalLinkIcon
            className={`w-5 h-5 ${
              website ? 'text-slate-500 hover:text-slate-900' : 'text-slate-300'
            }`}
          />
        </AnchorLink>
        <AnchorLink href={twitter}>
          <TwitterLogo
            className={`w-5 h-5 ${
              twitter ? 'text-slate-500 hover:text-slate-900' : 'text-slate-300'
            } `}
            title="Twitter Logo Icon"
          />
        </AnchorLink>
      </div>
    </DirectoryCard>
  );
}

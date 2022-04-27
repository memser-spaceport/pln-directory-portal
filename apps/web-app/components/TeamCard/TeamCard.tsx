/* eslint-disable jsx-a11y/anchor-is-valid */
import { ExternalLinkIcon } from '@heroicons/react/solid';
import { Tags } from '@protocol-labs-network/ui';
import Link from 'next/link';
import { getClickableLink } from '../../utils';
import { DirectoryCard } from '../DirectoryCard/DirectoryCard';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';

export interface TeamCardProps {
  teamData: {
    id?: number;
    name?: string;
    shortDescription?: string;
    twitter?: string;
    logo?: string;
    industry?: string[];
    website?: string;
  };
}

const handleClick = (target, id) => {
  const parentHasClass = target.closest('div').classList.contains('PLN-links');

  if (target.tagName === 'a' || parentHasClass) {
    return;
  }
  //TODO: implement dynamic route (uses id) after creating team page
};

export function TeamCard({ teamData }: TeamCardProps) {
  const { id, name, shortDescription, twitter, logo, industry, website } =
    teamData;

  return (
    <DirectoryCard isGrid={true} clickEv={(e) => handleClick(e.target, id)}>
      <div
        className={`w-full h-24 rounded-lg mb-5 ${
          logo ? 'bg-no-repeat bg-center bg-contain' : 'bg-slate-200'
        } `}
        style={{ backgroundImage: `url(${logo})` }}
      ></div>
      <h6 className="text-base text-slate-900 font-semibold">{name}</h6>
      <p className="mt-0.5 h-24 text-clip">{shortDescription}</p>

      <div className="text-xs text-slate-400 font-medium pt-3 h-[50px] border-b border-slate-200">
        {industry && industry.length ? (
          <Tags tagsList={industry} />
        ) : (
          'Industry not Provided'
        )}
      </div>
      <div className="PLN-links flex pt-4">
        {website ? (
          <Link href={getClickableLink(website)}>
            <a target="_blank">
              <ExternalLinkIcon className="mr-2 h-5 fill-slate-500 hover:fill-slate-900" />
            </a>
          </Link>
        ) : (
          <ExternalLinkIcon className="mr-2 h-5 fill-slate-300" />
        )}
        {twitter ? (
          <Link href={twitter}>
            <a target="_blank">
              <TwitterLogo
                className="mr-2 mt-1 fill-slate-500 hover:fill-slate-900"
                title="Twitter Logo Icon"
                width="auto"
                height="13px"
              />
            </a>
          </Link>
        ) : (
          <TwitterLogo
            className="mr-2 mt-1 fill-slate-300"
            title="Twitter Logo Icon"
            width="auto"
            height="13px"
          />
        )}
      </div>
    </DirectoryCard>
  );
}

export default TeamCard;

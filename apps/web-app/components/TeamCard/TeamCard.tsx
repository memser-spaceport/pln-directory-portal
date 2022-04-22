/* eslint-disable jsx-a11y/anchor-is-valid */
import { ExternalLinkIcon } from '@heroicons/react/solid';
import Link from 'next/link';
import { DirectoryCard } from '../DirectoryCard/DirectoryCard';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';

export interface TeamCardProps {
  teamData: {
    name?: string;
    shortDescription?: string;
    twitter?: string;
    logo?: string;
    industry?: string[];
    website?: string;
  };
}

export function TeamCard(props: TeamCardProps) {
  const { name, shortDescription, twitter, logo, industry, website } =
    props.teamData;

  const renderTags = (industry) => {
    return industry.map((item, index) => (
      <div
        key={index}
        className="text-xs px-3 py-1 mr-2 mb-2 border rounded-full"
      >
        {item}
      </div>
    ));
  };

  return (
    <DirectoryCard isGrid={true} clickEv={() => alert('teste')}>
      <div
        className={`w-full h-24 rounded-lg mb-5 ${
          logo ? 'bg-no-repeat bg-center bg-contain' : 'bg-slate-200'
        } `}
        style={{ backgroundImage: `url(${logo})` }}
      ></div>
      <h6 className="text-base text-slate-900 font-semibold">{name}</h6>
      <p className="mt-0.5 h-24 text-clip">{shortDescription}</p>

      <div className="flex flex-wrap h-12 overflow-hidden text-sm leading-6 font-medium py-3 border-b border-slate-200">
        {industry && industry.length ? (
          renderTags(industry)
        ) : (
          <span className="text-xs text-slate-400">industry not Provided</span>
        )}
      </div>
      <div className="flex pt-4">
        {website ? (
          <Link href={website}>
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

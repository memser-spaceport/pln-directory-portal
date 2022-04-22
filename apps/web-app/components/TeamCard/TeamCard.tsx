/* eslint-disable jsx-a11y/anchor-is-valid */
import { ExternalLinkIcon } from '@heroicons/react/solid';
import Link from 'next/link';
import { DirectoryCard } from '../DirectoryCard/DirectoryCard';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';

export interface TeamCardProps {
  teamData: {
    Name?: string;
    ShortDescription?: string;
    Twitter?: string;
    logoImage?: string;
    Industry?: string[];
    Website?: string;
  };
}

export function TeamCard(props: TeamCardProps) {
  const { Name, ShortDescription, Twitter, logoImage, Industry, Website } =
    props.teamData;

  const renderTags = (Industry) => {
    return Industry.map((item, index) => (
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
          logoImage ? 'bg-no-repeat bg-center bg-contain' : 'bg-slate-200'
        } `}
        style={{ backgroundImage: `url(${logoImage})` }}
      ></div>
      <h6 className="text-base text-slate-900 font-semibold">{Name}</h6>
      <p className="mt-0.5 h-24 text-clip">{ShortDescription}</p>

      <div className="flex flex-wrap h-12 overflow-hidden text-sm leading-6 font-medium py-3 border-b border-slate-200">
        {Industry && Industry.length ? (
          renderTags(Industry)
        ) : (
          <span className="text-xs text-slate-400">Industry not Provided</span>
        )}
      </div>
      <div className="flex pt-4">
        {Website ? (
          <Link href={Website}>
            <a target="_blank">
              <ExternalLinkIcon className="mr-2 h-5 fill-slate-500 hover:fill-slate-900" />
            </a>
          </Link>
        ) : (
          <ExternalLinkIcon className="mr-2 h-5 fill-slate-300" />
        )}
        {Twitter ? (
          <Link href={Twitter}>
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

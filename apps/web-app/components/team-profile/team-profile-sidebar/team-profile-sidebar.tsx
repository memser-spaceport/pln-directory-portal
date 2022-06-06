import { ITeam } from '@protocol-labs-network/api';
import { Tags } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { SocialLinks } from '../../shared/social-links/social-links';

interface TeamProfileSidebarProps {
  team: ITeam;
}

export default function TeamProfileSidebar({ team }: TeamProfileSidebarProps) {
  return (
    <div className="w-80 flex-none card">
      <div
        className={`w-24 h-24 mb-4 rounded-lg ${
          team.logo ? '' : 'bg-slate-200'
        }`}
      >
        {team.logo ? (
          <Image
            alt={`${team.name} Logo`}
            src={team.logo}
            width="100%"
            height="100%"
            layout="responsive"
            objectFit="contain"
          />
        ) : null}
      </div>
      <h3 className="text-base font-bold mb-4">{team.name}</h3>
      <div className="mb-16">{team.shortDescription}</div>
      <div className="mb-8">
        {team.industry && team.industry.length ? (
          <Tags items={team.industry} isInline={false} />
        ) : (
          'Industry not provided'
        )}
      </div>
      <div className="flex space-x-2">
        <SocialLinks website={team.website} twitter={team.twitter} />
      </div>
    </div>
  );
}

import { Tags } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { SocialLinks } from '../../social-links/social-links';

export default function TeamProfileSidebar({ team }) {
  return (
    <div className="w-1/3 bg-white shadow-slate-200 px-6 py-9 border rounded-lg shadow-md text-sm cursor-default">
      <div className="w-24 h-24 mb-4">
        <Image
          alt={`${team.name} Logo`}
          src={team.logo}
          width="100%"
          height="100%"
          layout="responsive"
          objectFit="contain"
        />
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

import { ITeam } from '@protocol-labs-network/api';
import { Tags } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { SocialLinks } from '../../../shared/social-links/social-links';

interface TeamProfileSidebarProps {
  team: ITeam;
}

export default function TeamProfileSidebar({ team }: TeamProfileSidebarProps) {
  return (
    <div className="card w-80 shrink-0 space-y-4 self-start">
      <div className="flex gap-3">
        <div className={`h-20 w-20 rounded ${team.logo ? '' : 'bg-slate-200'}`}>
          {team.logo ? (
            <Image
              className="rounded"
              alt={`${team.name} Logo`}
              src={team.logo}
              width="100%"
              height="100%"
              layout="responsive"
              objectFit="contain"
            />
          ) : null}
        </div>
        <div>
          <h3 className="text-lg font-semibold">
            {team.name || 'Not provided'}
          </h3>
        </div>
      </div>
      <div>{team.shortDescription || 'Not provided'}</div>
      <div>
        {team.industry && team.industry.length ? (
          <Tags items={team.industry} isInline={false} />
        ) : (
          'Industry not provided'
        )}
      </div>
      <div className="flex space-x-2 border-t border-slate-200 pt-4">
        <SocialLinks
          website={{ link: team.website }}
          twitter={{ link: team.twitter }}
        />
      </div>
    </div>
  );
}

import { UserGroupIcon } from '@heroicons/react/solid';
import { ITeam } from '@protocol-labs-network/api';
import Image from 'next/image';
import { SocialLinks } from '../../../shared/social-links/social-links';
import { TagsGroup } from '../../../shared/tags-group/tags-group';
import { parseStringsIntoTagsGroupItems } from '../../../shared/tags-group/tags-group.utils';

interface TeamProfileSidebarProps {
  team: ITeam;
}

export default function TeamProfileSidebar({ team }: TeamProfileSidebarProps) {
  const teamNameLastChar = team.name.slice(-1).toLowerCase();
  const possessiveMark = teamNameLastChar == 's' ? "'" : "'s";

  return (
    <div className="card w-80 shrink-0 space-y-4 self-start">
      <div className="flex gap-3">
        <div
          className={`relative h-20 w-20 overflow-hidden rounded ${
            team.logo ? '' : 'bg-slate-200'
          }`}
        >
          {team.logo ? (
            <Image
              className="rounded"
              alt={`${team.name} Logo`}
              src={team.logo}
              layout="fill"
              objectFit="contain"
              objectPosition="center"
            />
          ) : (
            <UserGroupIcon className="w-22 h-22 mt-2 fill-white" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold">
            {team.name || 'Not provided'}
          </h3>
        </div>
      </div>
      <div>{team.shortDescription || 'Not provided'}</div>
      <div>
        {team.tags && team.tags.length ? (
          <TagsGroup items={parseStringsIntoTagsGroupItems(team.tags)} />
        ) : (
          'Tags not provided'
        )}
      </div>
      <div className="border-t border-slate-200 pt-4">
        <SocialLinks
          website={{
            link: team.website,
            label: team.website ? `${team.name}${possessiveMark} website` : '',
          }}
          twitter={{ link: team.twitter, label: team.twitter }}
        />
      </div>
    </div>
  );
}

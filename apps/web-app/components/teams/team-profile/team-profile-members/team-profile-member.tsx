import { ChevronRightIcon, UserIcon } from '@heroicons/react/solid';
import { IMember } from '@protocol-labs-network/api';
import { AnchorLink } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { TeamLeadBadge } from '../../../shared/members/team-lead-badge/team-lead-badge';
import { TagsGroup } from '../../../shared/tags-group/tags-group';

export function TeamProfileMember({
  id,
  image,
  name,
  teamLead,
  role,
  teams,
}: IMember) {
  const teamsNames = teams.map(({ name }) => name);

  return (
    <div className="group h-[72px] w-full border-b border-slate-200 bg-white transition-all first:rounded-t-xl last:rounded-b-xl last:border-b-0 hover:bg-slate-50">
      <AnchorLink href={`/members/${id}`}>
        <div className="flex items-center p-4">
          <div className="relative mr-4 h-10 w-10 shrink-0">
            <div
              className={`flex h-10 w-10 overflow-hidden rounded-full  ${
                image ? '' : 'bg-slate-200'
              }`}
            >
              {image ? (
                <Image
                  className="rounded-full"
                  alt={`${name} Logo`}
                  src={image}
                  layout="fill"
                  objectFit="cover"
                  objectPosition="center"
                />
              ) : (
                <UserIcon className="mt-1 h-11 w-11 fill-white" />
              )}
            </div>

            {teamLead ? (
              <div className="absolute -top-1 -right-1 z-10">
                <TeamLeadBadge />
              </div>
            ) : null}
          </div>
          <div className="mr-4 w-60">
            <h3 className="text-sm font-semibold">{name}</h3>
            <p className="text-xs leading-[14px] text-slate-600">{role}</p>
          </div>
          <div>
            <TagsGroup items={teamsNames} isSingleLine={true} />
          </div>
          <div className="ml-auto w-12">
            <ChevronRightIcon className="h-4 w-4 fill-slate-500 group-hover:fill-slate-900" />
          </div>
        </div>
      </AnchorLink>
    </div>
  );
}

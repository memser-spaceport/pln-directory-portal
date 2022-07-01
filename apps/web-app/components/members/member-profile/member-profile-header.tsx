import { LocationMarkerIcon } from '@heroicons/react/solid';
import { IMember } from '@protocol-labs-network/api';
import Image from 'next/image';
import { SocialLinks } from '../../shared/social-links/social-links';
import { TagsGroup } from '../../shared/tags-group/tags-group';
import { parseStringsIntoTagsGroupItems } from '../../shared/tags-group/tags-group.utils';

interface MemberProfileHeaderProps {
  member: IMember;
}

export function MemberProfileHeader({ member }: MemberProfileHeaderProps) {
  return (
    <section className="m-8 rounded-t-3xl bg-white pt-4">
      <div className="flex items-center justify-end px-7 text-xs">
        <LocationMarkerIcon className="mr-1 h-4 w-4 fill-sky-600" />
        {member.location}
      </div>

      <div className="flex items-start space-x-6 px-7">
        <div
          className={`h-28 w-28 shrink-0 rounded-full ${
            member.image ? '' : 'bg-slate-200'
          }`}
        >
          {member.image ? (
            <Image
              className="rounded-full"
              alt={`${member.name} Logo`}
              src={member.image}
              width="100%"
              height="100%"
              layout="responsive"
              objectFit="cover"
            />
          ) : null}
        </div>
        <div className="mb-10">
          <h3 className="text-xl font-semibold">{member.name}</h3>
          <p className="line-clamp-1">{member.role}</p>
        </div>
      </div>
      <div className="px-7 py-6">
        <h3 className="mb-2 font-medium text-slate-400">Skills</h3>
        {member.skills.length ? (
          <TagsGroup items={parseStringsIntoTagsGroupItems(member.skills)} />
        ) : (
          <div className="leading-7">-</div>
        )}
      </div>
      <div className="border-t border-slate-200 px-7 py-4">
        <SocialLinks
          email={{ link: member.email }}
          github={{ link: member.githubHandle }}
          twitter={{ link: member.twitter }}
        />
      </div>
    </section>
  );
}

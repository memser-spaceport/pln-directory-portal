import { LocationMarkerIcon } from '@heroicons/react/outline';
import { UserIcon } from '@heroicons/react/solid';
import { IMember } from '@protocol-labs-network/api';
import { AnchorLink } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { DirectoryCard } from '../../../../components/directory/directory-card/directory-card';
import { SocialLinks } from '../../../../components/shared/social-links/social-links';
import { TagsGroup } from '../../tags-group/tags-group';

interface MemberCardProps {
  isClickable?: boolean;
  isGrid?: boolean;
  member: IMember;
  showLocation?: boolean;
}

export function MemberCard({
  isClickable = false,
  isGrid = true,
  member,
  showLocation = false,
}: MemberCardProps) {
  const router = useRouter();
  const backLink = encodeURIComponent(router.asPath);
  const anchorLinkProps = {
    ...(isClickable
      ? { href: `/members/${member.id}?backLink=${backLink}` }
      : {}),
  };
  const teamsNames = member.teams.map(({ name }) => name);

  return (
    <DirectoryCard isGrid={isGrid}>
      <AnchorLink {...anchorLinkProps}>
        <div className={`flex ${isGrid ? 'flex-col space-y-4' : 'flex-row'}`}>
          <div className={`${isGrid ? 'w-full' : 'w-[396px]'} flex space-x-4`}>
            <div
              className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full ${
                member.image ? '' : 'bg-slate-200'
              }`}
            >
              {member.image ? (
                <Image
                  className="rounded-full"
                  alt={`${member.name} Logo`}
                  src={member.image}
                  layout="fill"
                  objectFit="contain"
                  objectPosition="center"
                />
              ) : (
                <UserIcon className="w-22 h-22 mt-2 fill-white" />
              )}
            </div>
            <div>
              <h3 className="line-clamp-1 text-base font-semibold text-slate-900">
                {member.name}
              </h3>
              <p className="line-clamp-1">{member.role}</p>
              {showLocation ? (
                <div className="mt-2 flex items-center text-sm text-slate-500">
                  <LocationMarkerIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                  <span className="line-clamp-1">{member.location}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </AnchorLink>

      <div className={`${isGrid ? 'my-4' : 'mx-4 w-[348px] self-center'}`}>
        <h4 className="mb-2 text-sm font-medium text-slate-500">Teams</h4>
        <TagsGroup items={teamsNames} isSingleLine={true} />
      </div>

      <div
        className={`border-slate-200 ${
          isGrid
            ? 'border-t pt-4'
            : 'flex h-20 w-[99px] items-center justify-center self-center border-l pl-5'
        }`}
      >
        <SocialLinks
          email={{ link: member.email, label: member.email }}
          twitter={{ link: member.twitter, label: member.twitter }}
          github={{
            link: member.githubHandle,
            label: member.githubHandle ? `@${member.githubHandle}` : '',
          }}
        />
      </div>
    </DirectoryCard>
  );
}

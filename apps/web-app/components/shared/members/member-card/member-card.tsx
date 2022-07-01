import { LocationMarkerIcon } from '@heroicons/react/outline';
import { IMember, IMemberWithTeams } from '@protocol-labs-network/api';
import { AnchorLink } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { DirectoryCard } from '../../../../components/directory/directory-card/directory-card';
import { SocialLinks } from '../../../../components/shared/social-links/social-links';
import { TagsGroup } from '../../../shared/tags-group/tags-group';
import { parseStringsIntoTagsGroupItems } from '../../../shared/tags-group/tags-group.utils';
import { ITagsGroupItem } from '../../tags-group/tags-group';

interface MemberCardProps {
  isClickable?: boolean;
  isGrid?: boolean;
  member: IMember | IMemberWithTeams;
  showLocation?: boolean;
  showSkills?: boolean;
  showTeams?: boolean;
  teamId?: string;
}

export function MemberCard({
  isClickable = false,
  isGrid = true,
  member,
  showLocation = false,
  showSkills = false,
  showTeams = true,
  teamId,
}: MemberCardProps) {
  const router = useRouter();
  const backLink = encodeURIComponent(router.asPath);
  const anchorLinkProps = {
    ...(isClickable
      ? { href: `/members/${member.id}?backLink=${backLink}` }
      : {}),
  };
  let memberTeamsTags: ITagsGroupItem[];

  if (showTeams) {
    memberTeamsTags = Object.keys(member.teams).map((memberTeamId) => ({
      url: `/teams/${memberTeamId}`,
      label: member.teams[memberTeamId],
      disabled: teamId === memberTeamId,
    }));
  }

  return (
    <DirectoryCard isGrid={isGrid}>
      <AnchorLink {...anchorLinkProps}>
        <div className={`flex ${isGrid ? 'flex-col space-y-4' : 'flex-row'}`}>
          <div className={`${isGrid ? 'w-full' : 'w-[396px]'} flex space-x-4`}>
            <div
              className={`h-20 w-20 flex-shrink-0 rounded-full ${
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
            <div>
              <h3 className="line-clamp-1 text-base font-semibold text-slate-900">
                {member.name}
              </h3>
              <p className="line-clamp-1">{member.role}</p>
              {showLocation ? (
                <div className="mt-3 flex text-slate-500">
                  <LocationMarkerIcon className="mr-1 -ml-0.5 h-5 w-5 flex-shrink-0" />
                  <span className="line-clamp-1">{member.location}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </AnchorLink>

      {showTeams ? (
        <div className={`${isGrid ? 'my-4' : 'mx-4 w-[348px] self-center'}`}>
          <h4 className="mb-2 text-sm font-medium text-slate-500">Teams</h4>
          <TagsGroup items={memberTeamsTags} isInline={true} />
        </div>
      ) : null}

      {showSkills ? (
        <div
          className={`text-slate-500 ${
            isGrid ? 'mt-4 mb-2' : 'mx-4 w-[348px] self-center'
          }`}
        >
          <h4 className="mb-2 text-sm font-medium">Skills</h4>
          {member.skills.length ? (
            <TagsGroup
              items={parseStringsIntoTagsGroupItems(member.skills)}
              isInline={true}
            />
          ) : (
            <div className="leading-7">-</div>
          )}
        </div>
      ) : null}

      <div
        className={`border-slate-200 ${
          isGrid
            ? 'border-t pt-4'
            : 'h-20 w-[99px] items-center justify-center self-center border-l pl-5'
        }`}
      >
        <SocialLinks
          email={{ link: member.email }}
          twitter={{ link: member.twitter }}
          github={{ link: member.githubHandle }}
        />
      </div>
    </DirectoryCard>
  );
}

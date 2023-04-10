import { ChevronRightIcon } from '@heroicons/react/solid';
import { AnchorLink } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { MainTeamBadge } from '../../main-team-badge/main-team-badge';
import { TagsGroup } from '../../tags-group/tags-group';
import { TeamLeadBadge } from '../../team-lead-badge/team-lead-badge';

interface ProfileCardProps {
  url: string;
  isImageRounded?: boolean;
  imageUrl?: string;
  avatarIcon: (props: React.ComponentProps<'svg'>) => JSX.Element;
  name: string;
  showTeamLeadBadge?: boolean;
  showMainTeamBadge?: boolean;
  description?: string;
  tags?: string[];
}

export function ProfileCard({
  url,
  isImageRounded,
  imageUrl,
  avatarIcon,
  name,
  showTeamLeadBadge,
  showMainTeamBadge,
  description,
  tags,
}: ProfileCardProps) {
  const Icon = avatarIcon;

  return (
    <div className="profile-card group m-[1px]">
      <AnchorLink href={url} linkClassName="block on-focus">
        <div className="h-18 flex items-center p-4">
          <div className="relative mr-4 h-10 w-10 shrink-0">
            <div
              className={`relative flex h-10 w-10 overflow-hidden ${
                isImageRounded ? 'rounded-full' : 'rounded-lg'
              }  ${imageUrl ? '' : 'bg-slate-200'}`}
            >
              {imageUrl ? (
                <Image
                  className={isImageRounded ? 'rounded-full' : 'rounded-lg'}
                  alt={`${name} img`}
                  src={imageUrl}
                  layout="fill"
                  objectFit={isImageRounded ? 'cover' : 'contain'}
                  objectPosition="center"
                />
              ) : (
                <Icon className="mt-1 h-11 w-11 fill-white" />
              )}
            </div>
            {showTeamLeadBadge ? (
              <div className="absolute -right-1 -top-1 z-10">
                <TeamLeadBadge size="4" />
              </div>
            ) : null}
            {showMainTeamBadge ? (
              <div className="absolute -right-1 -top-1 z-10">
                <MainTeamBadge />
              </div>
            ) : null}
          </div>
          <div className="mr-4 w-64 shrink-0">
            <h3 className="line-clamp-1 text-sm font-semibold">{name}</h3>
            <p className="leading-3.5 line-clamp-2 text-xs text-slate-600">
              {description || '-'}
            </p>
          </div>
          <div className="w-96">
            {tags?.length ? (
              <TagsGroup items={tags} isSingleLine={true} />
            ) : (
              '-'
            )}
          </div>
          <div className="ml-auto w-12">
            <ChevronRightIcon className="h-4 w-4 fill-slate-500 group-hover:fill-slate-900" />
          </div>
        </div>
      </AnchorLink>
    </div>
  );
}

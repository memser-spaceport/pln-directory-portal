import Image from 'next/image';
import { TeamLeadBadge } from '../../shared/members/team-lead-badge/team-lead-badge';

export interface DirectoryCardHeaderProps {
  isGrid?: boolean;
  isImageRounded?: boolean;
  img?: string;
  name: string;
  avatarIcon: (props: React.ComponentProps<'svg'>) => JSX.Element;
  teamLead?: boolean;
}

export function DirectoryCardHeader({
  isGrid = true,
  isImageRounded,
  img,
  name,
  avatarIcon,
  teamLead,
}: DirectoryCardHeaderProps) {
  const Icon = avatarIcon;

  return (
    <>
      <div
        className={`h-18 w-18 relative shrink-0 border border-slate-200 ${
          isImageRounded ? 'rounded-full' : 'rounded-lg'
        } ${isGrid ? 'mx-auto' : ''} ${img ? 'bg-white' : 'bg-slate-200'}`}
      >
        {img ? (
          <Image
            className={isImageRounded ? 'rounded-full' : 'rounded-lg'}
            alt={`${name} img`}
            src={img}
            layout="fill"
            objectFit={isImageRounded ? 'cover' : 'contain'}
            objectPosition="center"
          />
        ) : (
          <Icon className="w-22 h-22 mt-2 fill-white" />
        )}
        {teamLead ? (
          <div className="absolute top-0 right-1 z-10">
            <TeamLeadBadge />
          </div>
        ) : null}
      </div>
    </>
  );
}

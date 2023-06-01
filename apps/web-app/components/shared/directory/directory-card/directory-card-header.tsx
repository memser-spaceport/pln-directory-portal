import Image from 'next/image';
import { TeamLeadBadge } from '../../team-lead-badge/team-lead-badge';
import { ReactComponent as BriefCase } from '../../../../public/assets/images/icons/mdi_briefcase-check.svg';

export interface DirectoryCardHeaderProps {
  isGrid?: boolean;
  isImageRounded?: boolean;
  img?: string;
  name: string;
  avatarIcon: (props: React.ComponentProps<'svg'>) => JSX.Element;
  teamLead?: boolean;
  openToWork?: boolean;
  userInfo?: any;
}

export function DirectoryCardHeader({
  isGrid = true,
  isImageRounded,
  img,
  name,
  avatarIcon,
  teamLead,
  openToWork,
  userInfo
}: DirectoryCardHeaderProps) {
  const Icon = avatarIcon;
  const isOpenTOWorkEnabled = (process.env.NEXT_PUBLIC_ENABLE_OPEN_TO_WORK  === 'true' && userInfo?.uid) ? true : false;
  return (
    <>
      {(isOpenTOWorkEnabled) && isGrid && openToWork && (
        <span className="absolute left-3 top-3 z-0 flex text-slate-600">
          <BriefCase />
          <span className="pl-1 pt-px text-[10px] font-medium leading-[14px] tracking-[0.01em]">
            OPEN TO WORK
          </span>
        </span>
      )}
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
          <div className="absolute right-1 top-0 z-10">
            <TeamLeadBadge size="5" />
          </div>
        ) : null}
      </div>
    </>
  );
}

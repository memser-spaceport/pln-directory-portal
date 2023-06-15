import Image from 'next/image';
import { TeamLeadBadge } from '../../team-lead-badge/team-lead-badge';
import { ReactComponent as BriefCase } from '../../../../public/assets/images/icons/mdi_briefcase-check.svg';
import { OpenToWorkBadge } from '../../open-to-work-badge/open-to-work-badge';

export interface DirectoryCardHeaderProps {
  isGrid?: boolean;
  isImageRounded?: boolean;
  img?: string;
  name: string;
  avatarIcon: (props: React.ComponentProps<'svg'>) => JSX.Element;
  teamLead?: boolean;
  openToWork?: boolean;
  userInfo?: any;
  type:string;
}

export function DirectoryCardHeader({
  isGrid = true,
  isImageRounded,
  img,
  name,
  avatarIcon,
  teamLead,
  openToWork,
  userInfo,
  type
}: DirectoryCardHeaderProps) {
  const Icon = avatarIcon;
  const isOpenTOWorkEnabled =
    process.env.NEXT_PUBLIC_ENABLE_OPEN_TO_WORK === 'true'
      ? true
      : false;
  return (
    type === "member" && isGrid ?
      <div className={ `${isGrid ? 'w-full h-24 overflow-hidden rounded-t-xl bg-gradient-to-b--white-to-slate-200' : '' }`}>
        <div className={`h-[104px] w-[104px] relative gradiant-border-rounded flex justify-center items-center ${isGrid ? 'mx-auto' : ''}`}> 
          <div
            className={`h-[72px] w-[72px] border border-slate-200 ${isImageRounded ? 'rounded-full' : 'rounded-lg'
              } ${img ? 'bg-white' : 'bg-slate-200'}`}
            >
            {img ? (
              <Image
                className={isImageRounded ? 'rounded-full' : 'rounded-lg'}
                alt={`${name} img`}
                src={img}
                height={72}
                width={72}
                objectFit={isImageRounded ? 'cover' : 'contain'}
                objectPosition="center"
              />
            ) : (
              <Icon className="w-22 h-22 mt-2 fill-white" />
            )}
          </div>
          {isOpenTOWorkEnabled && openToWork && (
            <div className={`absolute ${isGrid ? 'left-0 bottom-2' : 'left-6'} z-10`}>
              <OpenToWorkBadge type='CARD' />
            </div>
          )}
          {teamLead ? (
            <div className="absolute right-0 top-2 z-10">
              <TeamLeadBadge size="5" />
            </div>
          ) : null}
        </div>
      </div> 
      :
      <>
        <div
          className={`h-18 w-18 relative shrink-0 border border-slate-200 ${isImageRounded ? 'rounded-full' : 'rounded-lg'
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
          {isOpenTOWorkEnabled && openToWork && (
            <div className={`absolute ${isGrid ? 'left-0' : 'left-6'} right-0 bottom-[-16px] z-10  w-full`}>
              <OpenToWorkBadge type='CARD' />
            </div>
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

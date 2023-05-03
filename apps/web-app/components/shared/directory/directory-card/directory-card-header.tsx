import Image from 'next/image';
import { TeamLeadBadge } from '../../team-lead-badge/team-lead-badge';
import { ReactComponent as ExploreIcon } from '../../../../public/assets/images/icons/explore.svg';

export interface DirectoryCardHeaderProps {
  isGrid?: boolean;
  isImageRounded?: boolean;
  img?: string;
  name: string;
  avatarIcon: (props: React.ComponentProps<'svg'>) => JSX.Element;
  teamLead?: boolean;
  isOpenForWork?: boolean;
}

export function DirectoryCardHeader({
  isGrid = true,
  isImageRounded,
  img,
  name,
  avatarIcon,
  teamLead,
  isOpenForWork
}: DirectoryCardHeaderProps) {
  const Icon = avatarIcon;

  return (
    <> 
      { 
          isOpenForWork
          ? (
            <div className='flex absolute left-3 top-2 text-xs text-[#475569]'>
              <ExploreIcon/> <div className='ml-1'>OPEN TO WORK</div>
            </div> 
        ) : null
      }
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

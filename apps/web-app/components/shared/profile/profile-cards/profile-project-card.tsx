import { ChevronRightIcon } from '@heroicons/react/solid';
import { AnchorLink } from '@protocol-labs-network/ui';
import Image from 'next/image';

interface ProfileProjectCardProps {
  url: string;
  isImageRounded?: boolean;
  imageUrl?: string;
  avatarIcon: (props: React.ComponentProps<'svg'>) => JSX.Element;
  name: string;
  description?: string;
}

export function ProfileProjectCard({
  url,
  isImageRounded,
  imageUrl,
  avatarIcon,
  name,
  description,
}: ProfileProjectCardProps) {
  const Icon = avatarIcon;

  return (
    <div className="profile-card group m-[1px]">
      <AnchorLink href={url} linkClassName="block on-focus">
        <div className="h-18 flex items-start p-4">
          <div className="relative mr-4 h-10 w-10 shrink-0">
            <div className={`relative flex h-10 w-10 overflow-hidden`}>
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
                <Icon />
              )}
            </div>
          </div>
          <div className="mr-4 w-[80%] shrink-0">
            <h3 className="line-clamp-1 text-sm font-semibold">{name}</h3>
            <p className="leading-3.5 line-clamp-2 text-xs text-slate-600">
              {description || '-'}
            </p>
          </div>
          <div className="ml-auto w-12 pt-4">
            <ChevronRightIcon className="h-4 w-4 fill-slate-500 group-hover:fill-slate-900" />
          </div>
        </div>
      </AnchorLink>
    </div>
  );
}

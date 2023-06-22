/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { TSocialLinkType } from '../../../shared/social-links/social-link/social-link.types';
import { getSocialLinkUrl } from '../../../shared/social-links/social-link/social-link.utils';

interface ProfileSocialLinkProps {
  profile :string,
  url: string;
  type?: TSocialLinkType;
  logo?: string;
  height?: number;
  width?: number;
  preferred?: boolean;
}

export function ProfileSocialLink({ profile, url, type, logo, height, width, preferred }: ProfileSocialLinkProps) {
  return (
    <a
      href={getSocialLinkUrl(profile, type, url)}
      target="_blank"
      rel="noreferrer noopener"
      data-testid="profile-social-link"
      className={`flex h-[26px] cursor-pointer items-center gap-2 ${ preferred ? 'rounded-r pr-3 pl-2':'rounded px-3'} bg-[#F1F5F9] font-medium`}
    >
      <img src={logo} alt={type} height={height} width={width} />
      <p className="on-focus--link break-all text-left text-[12px] leading-[14px] text-base hover:text-slate-700 max-w-[120px] truncate">
        {profile ? profile : url}
      </p>
    </a>
  );
}

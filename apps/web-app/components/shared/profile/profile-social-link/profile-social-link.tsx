/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { TSocialLinkType } from '../../../shared/social-links/social-link/social-link.types';
import { getSocialLinkUrl } from '../../../shared/social-links/social-link/social-link.utils';

interface ProfileSocialLinkProps {
  url: string;
  type?: TSocialLinkType;
  logo?: string;
  height?: number;
  width?: number;
}

export function ProfileSocialLink({ url, type, logo, height, width }: ProfileSocialLinkProps) {
  return (
    <a
      href={getSocialLinkUrl(url, type)}
      target="_blank"
      rel="noreferrer noopener"
      data-testid="profile-social-link"
      className="flex h-9 w-40 cursor-pointer items-center gap-2 rounded bg-[#F1F5F9] px-3 font-medium"
    >
      <img src={logo} alt="twitter" height={height} width={width} />
      <p className="on-focus--link line-clamp-1 break-all text-left text-base hover:text-slate-700">
        {url}
      </p>
    </a>
  );
}

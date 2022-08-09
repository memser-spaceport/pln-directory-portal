import Link from 'next/link';
import { TSocialLinkType } from '../../../shared/social-links/social-link/social-link.types';
import { getSocialLinkUrl } from '../../../shared/social-links/social-link/social-link.utils';

interface ProfileSocialLinkProps {
  url: string;
  type?: TSocialLinkType;
}

export function ProfileSocialLink({ url, type }: ProfileSocialLinkProps) {
  return (
    <Link href={getSocialLinkUrl(url, type)}>
      <a
        className="line-clamp-1 on-focus--link break-all text-left text-base hover:text-slate-700"
        target="_blank"
      >
        {url}
      </a>
    </Link>
  );
}

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
        className="focus:shadow-special-button-hover line-clamp-1 break-all text-left text-base hover:text-slate-600"
        target="_blank"
      >
        {url}
      </a>
    </Link>
  );
}

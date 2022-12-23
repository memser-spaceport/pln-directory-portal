import { TSocialLinkType } from '../../../shared/social-links/social-link/social-link.types';
import { getSocialLinkUrl } from '../../../shared/social-links/social-link/social-link.utils';

interface ProfileSocialLinkProps {
  url: string;
  type?: TSocialLinkType;
}

export function ProfileSocialLink({ url, type }: ProfileSocialLinkProps) {
  return (
    <a
      href={getSocialLinkUrl(url, type)}
      className="line-clamp-1 on-focus--link break-all text-left text-base hover:text-slate-700"
      target="_blank"
      rel="noreferrer noopener"
      data-testid="profile-social-link"
    >
      {url}
    </a>
  );
}

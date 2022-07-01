import { MailIcon } from '@heroicons/react/outline';
import { ExternalLinkIcon } from '@heroicons/react/solid';
import { SocialLink } from './social-link/social-link';
import { ISocialLink } from './social-link/social-link.types';
import { ReactComponent as GitHubLogo } from '/public/assets/images/icons/github-logo-icon.svg';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';

interface SocialLinksProps {
  email?: ISocialLink;
  github?: ISocialLink;
  twitter?: ISocialLink;
  website?: ISocialLink;
}

export function SocialLinks({
  email,
  github,
  twitter,
  website,
}: SocialLinksProps) {
  return (
    <div className="flex space-x-2">
      {email ? (
        <SocialLink linkObj={email} linkIcon={MailIcon} type={'email'} />
      ) : null}
      {website ? (
        <SocialLink linkObj={website} linkIcon={ExternalLinkIcon} />
      ) : null}
      {github ? (
        <SocialLink linkObj={github} linkIcon={GitHubLogo} type={'github'} />
      ) : null}
      {twitter ? (
        <SocialLink linkObj={twitter} linkIcon={TwitterLogo} type={'twitter'} />
      ) : null}
    </div>
  );
}

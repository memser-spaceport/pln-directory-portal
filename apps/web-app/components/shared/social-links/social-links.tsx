import { ExternalLinkIcon, MailIcon } from '@heroicons/react/solid';
import { SocialLink } from './social-link';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';

interface ISocialLink {
  link?: string;
}

interface SocialLinksProps {
  email?: ISocialLink;
  website?: ISocialLink;
  twitter?: ISocialLink;
}

export function SocialLinks({ email, website, twitter }: SocialLinksProps) {
  return (
    <>
      {email ? (
        <SocialLink linkObj={email} linkIcon={MailIcon} type={'email'} />
      ) : null}
      {website ? (
        <SocialLink linkObj={website} linkIcon={ExternalLinkIcon} />
      ) : null}
      {twitter ? (
        <SocialLink linkObj={twitter} linkIcon={TwitterLogo} type={'twitter'} />
      ) : null}
    </>
  );
}

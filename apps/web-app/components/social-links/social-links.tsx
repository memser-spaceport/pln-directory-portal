import { ExternalLinkIcon } from '@heroicons/react/solid';
import { AnchorLink } from '@protocol-labs-network/ui';
import { ReactComponent as TwitterLogo } from '/public/assets/images/icons/twitter-logo-icon.svg';

type SocialLinksProps = {
  website?: string;
  twitter?: string;
};

export function SocialLinks({ website, twitter }: SocialLinksProps) {
  const websiteLinkProps = {
    ...(website && { href: website }),
  };
  const twitterLinkProps = {
    ...(twitter && { href: `https://twitter.com/${twitter}` }),
  };

  return (
    <>
      <AnchorLink {...websiteLinkProps}>
        <ExternalLinkIcon
          className={`w-5 h-5 ${
            website ? 'text-slate-500 hover:text-slate-900' : 'text-slate-300'
          }`}
        />
      </AnchorLink>
      <AnchorLink {...twitterLinkProps}>
        <TwitterLogo
          className={`w-5 h-5 ${
            twitter ? 'text-slate-500 hover:text-slate-900' : 'text-slate-300'
          }`}
          title="Twitter"
        />
      </AnchorLink>
    </>
  );
}

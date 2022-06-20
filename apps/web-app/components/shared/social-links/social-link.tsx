import { AnchorLink, isValidEmail } from '@protocol-labs-network/ui';

interface ISocialLink {
  link?: string;
}

interface SocialLinkProps {
  linkObj: ISocialLink;
  linkIcon: (props: React.ComponentProps<'svg'>) => JSX.Element;
  type?: 'email' | 'twitter';
}

export function SocialLink({ linkObj, linkIcon, type }: SocialLinkProps) {
  const Icon = linkIcon;

  const isActive = type === 'email' ? isValidEmail(linkObj.link) : linkObj.link;
  const url =
    type === 'email'
      ? `mailto:${linkObj.link}`
      : type === 'twitter'
      ? `https://twitter.com/${linkObj.link}`
      : linkObj.link;

  const linkProps = {
    ...(isActive && { href: url }),
  };

  return (
    <AnchorLink {...linkProps}>
      <Icon
        className={`h-5 w-5 ${
          isActive ? 'text-slate-500 hover:text-slate-600' : 'text-slate-300'
        }`}
      />
    </AnchorLink>
  );
}

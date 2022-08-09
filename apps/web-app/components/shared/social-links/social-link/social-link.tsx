import { AnchorLink, isValidEmail, Tooltip } from '@protocol-labs-network/ui';
import { ISocialLink, TSocialLinkType } from './social-link.types';
import { getSocialLinkUrl } from './social-link.utils';

interface SocialLinkProps {
  linkObj: ISocialLink;
  linkIcon: (props: React.ComponentProps<'svg'>) => JSX.Element;
  type?: TSocialLinkType;
}

export function SocialLink({ linkObj, linkIcon, type }: SocialLinkProps) {
  const Icon = linkIcon;

  const isActive = type === 'email' ? isValidEmail(linkObj.link) : linkObj.link;
  const url = getSocialLinkUrl(linkObj.link, type);

  const linkProps = {
    ...(isActive && { href: url }),
  };

  return (
    <AnchorLink {...linkProps}>
      {linkObj.label ? (
        <Tooltip
          trigger={
            <Icon
              className={`stroke-1.5 h-5 w-5 ${
                isActive
                  ? 'text-slate-500 hover:text-slate-600'
                  : 'text-slate-300'
              }`}
            />
          }
          content={linkObj.label}
        />
      ) : (
        <Icon className="h-5 w-5 text-slate-300" />
      )}
    </AnchorLink>
  );
}

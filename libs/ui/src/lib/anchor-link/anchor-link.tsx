import Link, { LinkProps } from 'next/link';
import { parseLink } from './anchor-link.utils';

export type AnchorLinkProps = {
  linkClassName?: string;
} & React.PropsWithChildren<Partial<LinkProps>>;

export function AnchorLink({ href, linkClassName, children }: AnchorLinkProps) {
  if (href) {
    const { link, isExternal } = parseLink(href);

    return (
      <Link href={link}>
        <a
          className={`cursor-pointer ${linkClassName}`}
          target={isExternal ? '_blank' : '_self'}
          {...(isExternal ? { rel: 'noopener noreferrer' } : {})}
          aria-label="card anchor"
          tabIndex={0}
        >
          {children}
        </a>
      </Link>
    );
  }

  return children as JSX.Element;
}

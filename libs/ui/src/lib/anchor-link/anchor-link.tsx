import Link, { LinkProps } from 'next/link';
import { parseLink } from './anchor-link.utils';

export type AnchorLinkProps = { email?: string } & React.PropsWithChildren<
  Partial<LinkProps>
>;

export function AnchorLink({ href, children }: AnchorLinkProps) {
  if (href) {
    const { link, isExternal } = parseLink(href);

    return (
      <Link href={link}>
        <a
          className="cursor-pointer"
          target={isExternal ? '_blank' : '_self'}
          {...(isExternal ? { rel: 'noopener noreferrer' } : {})}
        >
          {children}
        </a>
      </Link>
    );
  }

  return <span>{children}</span>;
}

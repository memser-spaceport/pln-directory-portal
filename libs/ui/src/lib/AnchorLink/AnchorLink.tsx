import Link, { LinkProps } from 'next/link';

export type AnchorLinkProps = React.PropsWithChildren<Partial<LinkProps>>;

function isExternalLink(link: string) {
  const href = link.toString();

  return href.startsWith('http://') || href.startsWith('https://');
}

function parseLink(link: LinkProps['href']) {
  const href = link.toString();
  const isExternal = isExternalLink(href);


  return {
    link: href.startsWith('/') ? href : isExternal ? href : `http://${link}`,
    isExternal,
  }
}

export function AnchorLink({ href, children }: AnchorLinkProps) {
  if (href) {
    const { link, isExternal } = parseLink(href);

    return (
      <Link href={link}>
        <a target={isExternal ? '_blank' : '_self'} {...(isExternal ? { rel:"noopener noreferrer" } : {})}>{children}</a>
      </Link>
    );
  }

  return <span>{children}</span>;
}

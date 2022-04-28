import Link, { LinkProps } from 'next/link';

export type AnchorLinkProps = React.PropsWithChildren<Partial<LinkProps>>;

function isExternalLink(link: LinkProps['href']) {
  const href = link.toString();

  return href.startsWith('http://') || href.startsWith('https://');
}

function normalizeLink(link: LinkProps['href']) {
  const href = link.toString();

  if (href.startsWith('/')) {
    return href;
  }

  return isExternalLink(href) ? href : `http://${link}`;
}

export function AnchorLink({ href, children }: AnchorLinkProps) {
  if (href) {
    const link = normalizeLink(href);
    const isExternal = isExternalLink(link);

    return (
      <Link href={link}>
        <a target={isExternal ? '_blank' : '_self'}>{children}</a>
      </Link>
    );
  }

  return <span>{children}</span>;
}

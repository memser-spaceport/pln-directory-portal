import { LinkProps } from 'next/link';

/**
 * Returns a boolean after validating an email address using a Regex
 */
export function isValidEmail(email: string) {
  const emailRegex = /\S+@\S+\.\S+/;

  return email && emailRegex.test(email);
}

/**
 * Returns a boolean after checking if a link has http or https in it
 */
function isExternalLink(link: string) {
  const href = link.toString();

  return href.startsWith('http://') || href.startsWith('https://');
}

/**
 * Returns a valid link and a boolean that validates if it's external
 */
export function parseLink(link: LinkProps['href']) {
  const href = link.toString();
  const isExternal = isExternalLink(href);

  return {
    link:
      href.startsWith('/') || href.startsWith('mailto:')
        ? href
        : isExternal
        ? href
        : `http://${link}`,
    isExternal,
  };
}

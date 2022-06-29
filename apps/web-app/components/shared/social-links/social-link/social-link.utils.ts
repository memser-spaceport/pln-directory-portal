import { TSocialLinkType } from './social-link.types';

export function getSocialLinkUrl(linkContent: string, type?: TSocialLinkType) {
  if (type === 'email') return `mailto:${linkContent}`;
  if (type === 'twitter') return `https://twitter.com/${linkContent}`;
  if (type === 'github') return `https://github.com/${linkContent}`;

  return linkContent;
}

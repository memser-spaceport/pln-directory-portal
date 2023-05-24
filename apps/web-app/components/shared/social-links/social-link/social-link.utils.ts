import { TSocialLinkType } from './social-link.types';

export function getSocialLinkUrl(linkContent: string, type?: TSocialLinkType) {
  if (type === 'email') return `mailto:${linkContent}`;
  if (type === 'twitter') return `https://twitter.com/${linkContent}`;
  if (type === 'github') return `https://github.com/${linkContent}`;
  if (type === 'linkedin') {
    if (
      !linkContent.toLowerCase().includes('https://') &&
      !linkContent.toLowerCase().includes('linkedin')
    ) {
      return `https://linkedin.com/in/${linkContent}`;
    } else if (
      !linkContent.toLowerCase().includes('https://') &&
      linkContent.toLowerCase().includes('linkedin')
    ) {
      return `https://${linkContent}`;
    }
  }

  return linkContent;
}

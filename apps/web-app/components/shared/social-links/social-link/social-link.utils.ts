import { TSocialLinkType } from './social-link.types';

export function getSocialLinkUrl(linkContent: string, type?: TSocialLinkType, url?: string) {
  if (type === 'email') return `mailto:${linkContent}`;
  if (type === 'twitter') return `https://twitter.com/${linkContent}`;
  if (type === 'github') return `https://github.com/${linkContent}`;
  if (type === 'telegram') return `https://t.me/${linkContent}`;
  if (type === 'linkedin' && linkContent != url) {
    return url;
  } else if (type === 'linkedin' && linkContent === url){
    return `https://www.linkedin.com/search/results/all/?keywords=${linkContent}`;
  }
  if (type === 'discord') return 'https://discord.com/app';

  return linkContent;
}

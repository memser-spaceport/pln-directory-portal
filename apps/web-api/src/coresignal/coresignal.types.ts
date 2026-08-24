import type { ScrapingDogPersonProfile } from '../husky/member-scrapingdog.service';

/**
 * Coresignal's Clean Employee profile, normalized into the same shape
 * `MemberScrapingDogService.fetchPersonProfile` already returns (experience
 * entries, headline, current position), so downstream consumers need no
 * Coresignal-specific branching.
 */
export type CoresignalEmployeeProfile = ScrapingDogPersonProfile;

export type CoresignalFetchResult =
  | { kind: 'ok'; profile: CoresignalEmployeeProfile }
  | { kind: 'not-found' }
  | { kind: 'not-configured' }
  | { kind: 'error'; reason: string };

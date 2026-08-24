import type { ScrapingDogPersonProfile } from '../husky/member-scrapingdog.service';

/**
 * Coresignal's Multi-source Employee profile, normalized into the same shape
 * `MemberScrapingDogService.fetchPersonProfile` already returns (experience
 * entries, headline, current position) — see design.md decision #3 in
 * openspec/changes/add-coresignal-member-enrichment. Downstream consumers
 * (member-enrichment-team-match.util.ts, member-enrichment-experience.util.ts)
 * need no Coresignal-specific branching as a result.
 */
export type CoresignalEmployeeProfile = ScrapingDogPersonProfile;

export type CoresignalFetchResult =
  | { kind: 'ok'; profile: CoresignalEmployeeProfile }
  | { kind: 'not-found' }
  | { kind: 'not-configured' }
  | { kind: 'error'; reason: string };

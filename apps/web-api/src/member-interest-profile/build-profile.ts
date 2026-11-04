import { MEMBER_SIGNAL_REMOVALS, MemberSignalAction } from '../member-signals/member-signals.constants';
import {
  INDIRECT_FACTORS,
  MIN_STORED_SCORE,
  ProfileEntityType,
  ProfileKind,
  REPEAT_FACTOR,
  SIGNAL_WEIGHTS,
  SOURCE_WEIGHTS,
} from './member-interest-profile.constants';

/**
 * Pure scoring of one member's interest profile (LAB-3122). The loader gathers
 * the sources and lookups; this function owns every scoring rule:
 *
 * - weight × 0.5^(age / half-life), never dropped for age
 * - the n-th repeat of an action on the same item adds REPEAT_FACTOR^n
 * - a removal clears the earlier rows of the action it cancels
 * - own rows (own profile, own teams, own posts) add nothing to interests
 * - the current team adds its focus areas at a low weight, never itself
 * - own posts and own-team comments add to expertise only
 */
export type SignalRow = {
  action: string;
  entityType: string;
  entityUid: string;
  own: boolean;
  createdAt: Date;
};

export type ProfileSources = {
  memberUid: string;
  /** Team roles with no end date, or one in the future. */
  currentTeamUids: string[];
  pastTeams: { teamUid: string; endDate: Date }[];
  signals: SignalRow[];
  heldMeetings: { targetMemberUid: string; createdAt: Date }[];
  eventTopics: { topics: string[]; createdAt: Date }[];
  referrals: { referredMemberUid: string | null; jobTeamUid: string | null; createdAt: Date }[];
  /** Skill titles, custom skills and office hours interests, as typed. */
  declaredInterests: string[];
  savedNewsTags: string[];
  ownPosts: { tags: string[]; createdAt: Date }[];
};

export type ProfileLookups = {
  /** Focus-area slugs of a team (focus areas and their ancestors). */
  teamTopics: (teamUid: string) => readonly string[];
  projectTopics: (projectUid: string) => readonly string[];
  /** Current teams of another member. */
  memberTeams: (memberUid: string) => readonly string[];
  newsItem: (uid: string) => { teamUid: string; tags: readonly string[] } | undefined;
  jobTeam: (jobUid: string) => string | undefined;
  /** Is this slug a focus area? */
  isTopic: (slug: string) => boolean;
  /** Slug of a free-text value, for declared interests and IRL topics. */
  slugify: (value: string) => string;
  isExcludedMember: (memberUid: string) => boolean;
};

export type ProfileEntry = { kind: ProfileKind; key: string; score: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function entityKey(type: ProfileEntityType, uid: string): string {
  return `${type}:${uid}`;
}

export function buildProfile(
  sources: ProfileSources,
  lookups: ProfileLookups,
  options: { now: Date; halfLifeDays: number }
): ProfileEntry[] {
  const scores = new Map<string, ProfileEntry>();
  const currentTeams = new Set(sources.currentTeamUids);
  const decay = (at: Date) => {
    const ageDays = Math.max(0, (options.now.getTime() - at.getTime()) / DAY_MS);
    return Math.pow(0.5, ageDays / options.halfLifeDays);
  };

  const add = (kind: ProfileKind, key: string, weight: number) => {
    if (!(weight > 0)) return;
    const id = `${kind}|${key}`;
    const entry = scores.get(id) ?? { kind, key, score: 0 };
    entry.score += weight;
    scores.set(id, entry);
  };
  const addTopics = (slugs: Iterable<string>, weight: number, kind: ProfileKind = 'TOPIC') => {
    for (const slug of new Set(slugs)) if (lookups.isTopic(slug)) add(kind, slug, weight);
  };
  const addTeam = (teamUid: string, weight: number, entityWeight = weight) => {
    if (currentTeams.has(teamUid)) return;
    add('ENTITY', entityKey('TEAM', teamUid), entityWeight);
    addTopics(lookups.teamTopics(teamUid), weight);
  };
  const addMember = (memberUid: string, weight: number) => {
    if (memberUid === sources.memberUid || lookups.isExcludedMember(memberUid)) return;
    add('ENTITY', entityKey('MEMBER', memberUid), weight);
    const teamTopics = lookups.memberTeams(memberUid).flatMap((teamUid) => lookups.teamTopics(teamUid));
    addTopics(teamTopics, weight * INDIRECT_FACTORS.memberTeamTopics);
  };

  // Logged actions.
  for (const { entityType, entityUid, weights } of weighSignals(sources.signals, decay)) {
    for (const weight of weights) {
      switch (entityType) {
        case 'TEAM':
          addTeam(entityUid, weight);
          break;
        case 'MEMBER':
          addMember(entityUid, weight);
          break;
        case 'PROJECT':
          add('ENTITY', entityKey('PROJECT', entityUid), weight);
          addTopics(lookups.projectTopics(entityUid), weight);
          break;
        case 'NEWS_ITEM': {
          const item = lookups.newsItem(entityUid);
          if (!item) break;
          addTopics(item.tags, weight);
          if (!currentTeams.has(item.teamUid)) {
            add('ENTITY', entityKey('TEAM', item.teamUid), weight * INDIRECT_FACTORS.newsTeamEntity);
          }
          break;
        }
        case 'JOB_OPENING': {
          const teamUid = lookups.jobTeam(entityUid);
          if (teamUid) addTeam(teamUid, weight);
          break;
        }
      }
    }
  }

  // Own comments on own-team news → expertise.
  for (const row of sources.signals) {
    if (row.action !== 'news-comment' || !row.own || row.entityType !== 'NEWS_ITEM') continue;
    const item = lookups.newsItem(row.entityUid);
    if (item) addTopics(item.tags, SOURCE_WEIGHTS.ownCommentExpertise * decay(row.createdAt), 'EXPERTISE');
  }

  // Own current team: its focus areas at a fixed low weight, never the team.
  for (const teamUid of currentTeams) addTopics(lookups.teamTopics(teamUid), SOURCE_WEIGHTS.currentTeamTopic);

  // Past teams: a weak interest, aging from when the role ended.
  for (const { teamUid, endDate } of sources.pastTeams) {
    addTeam(teamUid, SOURCE_WEIGHTS.pastTeam * decay(endDate));
  }

  for (const { targetMemberUid, createdAt } of sources.heldMeetings) {
    addMember(targetMemberUid, SOURCE_WEIGHTS.heldOfficeHoursMeeting * decay(createdAt));
  }

  for (const { topics, createdAt } of sources.eventTopics) {
    addTopics(
      topics.map((topic) => lookups.slugify(topic)),
      SOURCE_WEIGHTS.irlEventTopic * decay(createdAt)
    );
  }

  for (const { referredMemberUid, jobTeamUid, createdAt } of sources.referrals) {
    const weight = SOURCE_WEIGHTS.jobReferral * decay(createdAt);
    if (referredMemberUid) addMember(referredMemberUid, weight);
    if (jobTeamUid) addTeam(jobTeamUid, weight);
  }

  // Declared: no decay, and only values that are focus areas.
  addTopics(
    sources.declaredInterests.map((value) => lookups.slugify(value)),
    SOURCE_WEIGHTS.declaredInterest
  );
  addTopics(sources.savedNewsTags, SOURCE_WEIGHTS.savedNewsTag);

  for (const { tags, createdAt } of sources.ownPosts) {
    addTopics(tags, SOURCE_WEIGHTS.ownPostExpertise * decay(createdAt), 'EXPERTISE');
  }

  return [...scores.values()]
    .map((entry) => ({ ...entry, score: Math.round(entry.score * 10000) / 10000 }))
    .filter((entry) => entry.score >= MIN_STORED_SCORE);
}

/**
 * Groups signal rows by (cancellable action, entity), applies removals and
 * repeat damping, and returns the decayed weight of every remaining row.
 * Own rows and actions without a weight are skipped.
 */
export function weighSignals(
  rows: SignalRow[],
  decay: (at: Date) => number
): { action: string; entityType: string; entityUid: string; weights: number[] }[] {
  const groups = new Map<string, { action: string; entityType: string; entityUid: string; rows: SignalRow[] }>();
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const row of sorted) {
    if (row.own) continue;
    const cancelled = MEMBER_SIGNAL_REMOVALS[row.action as MemberSignalAction];
    const action = cancelled ?? row.action;
    const id = `${action}|${row.entityType}|${row.entityUid}`;
    const group = groups.get(id) ?? { action, entityType: row.entityType, entityUid: row.entityUid, rows: [] };
    groups.set(id, group);
    if (cancelled) {
      group.rows = [];
    } else {
      group.rows.push(row);
    }
  }

  return [...groups.values()].map((group) => {
    const base = SIGNAL_WEIGHTS[group.action as MemberSignalAction] ?? 0;
    return {
      action: group.action,
      entityType: group.entityType,
      entityUid: group.entityUid,
      weights: group.rows.map((row, n) => base * Math.pow(REPEAT_FACTOR, n) * decay(row.createdAt)),
    };
  });
}

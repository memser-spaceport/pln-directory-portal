import type { PrismaClient } from '@prisma/client';
import { isExcludedMember } from '../member-signals/member-exclusion';
import { readStoredNewsTags } from '../team-news/utils/news-tags';
import { NewsTagVocabulary } from '../team-news/news-tag-vocabulary.service';
import { slugify } from '../utils/helper/helper';
import type { ProfileLookups, ProfileSources } from './build-profile';

type LoaderPrisma = Pick<
  PrismaClient,
  | 'memberSignal'
  | 'teamMemberRole'
  | 'memberInteraction'
  | 'pLEventGuest'
  | 'jobReferral'
  | 'teamNewsItem'
  | 'member'
  | 'jobOpening'
  | 'teamFocusArea'
  | 'projectFocusArea'
>;

export type ProfileMember = {
  uid: string;
  preferences: unknown;
  customSkills: string[];
  ohInterest: string[];
  skills: { title: string }[];
};

const isCurrentRole = (endDate: Date | null, now: Date) => !endDate || endDate > now;

/**
 * Loads every source of one batch of members, plus the entity lookups those
 * sources reference, with one `in` query per table (LAB-3122). Read-only: it
 * never writes `Member.preferences` or any source table.
 */
export async function loadProfileBatch(
  prisma: LoaderPrisma,
  members: ProfileMember[],
  vocabulary: NewsTagVocabulary,
  now: Date
): Promise<{ sources: ProfileSources[]; lookups: ProfileLookups }> {
  const uids = members.map((m) => m.uid);

  const [signals, roles, meetings, guests, referrals, ownPosts] = await Promise.all([
    prisma.memberSignal.findMany({
      where: { memberUid: { in: uids } },
      select: { memberUid: true, action: true, entityType: true, entityUid: true, own: true, createdAt: true },
    }),
    prisma.teamMemberRole.findMany({
      where: { memberUid: { in: uids } },
      select: { memberUid: true, teamUid: true, endDate: true },
    }),
    prisma.memberInteraction.findMany({
      where: {
        sourceMemberUid: { in: uids },
        type: 'SCHEDULE_MEETING',
        targetMemberUid: { not: null },
        interactionFollowUps: { some: { feedbacks: { isNot: null } } },
      },
      select: { sourceMemberUid: true, targetMemberUid: true, createdAt: true },
    }),
    prisma.pLEventGuest.findMany({
      where: { memberUid: { in: uids } },
      select: { memberUid: true, topics: true, createdAt: true },
    }),
    prisma.jobReferral.findMany({
      where: { referrerMemberUid: { in: uids } },
      select: {
        referrerMemberUid: true,
        referredMemberUid: true,
        createdAt: true,
        jobOpening: { select: { teamUid: true } },
      },
    }),
    prisma.teamNewsItem.findMany({
      where: { postedByMemberUid: { in: uids } },
      select: { postedByMemberUid: true, tags: true, createdAt: true },
    }),
  ]);

  // Entities the sources point at.
  const targetMembers = new Set<string>();
  const newsUids = new Set<string>();
  const jobUids = new Set<string>();
  const projectUids = new Set<string>();
  for (const s of signals) {
    if (s.entityType === 'MEMBER') targetMembers.add(s.entityUid);
    if (s.entityType === 'NEWS_ITEM') newsUids.add(s.entityUid);
    if (s.entityType === 'JOB_OPENING') jobUids.add(s.entityUid);
    if (s.entityType === 'PROJECT') projectUids.add(s.entityUid);
  }
  for (const m of meetings) if (m.targetMemberUid) targetMembers.add(m.targetMemberUid);
  for (const r of referrals) if (r.referredMemberUid) targetMembers.add(r.referredMemberUid);

  const [targetRows, targetRoles, newsRows, jobRows] = await Promise.all([
    prisma.member.findMany({
      where: { uid: { in: [...targetMembers] } },
      select: { uid: true, signUpSource: true, email: true, deletedAt: true },
    }),
    prisma.teamMemberRole.findMany({
      where: { memberUid: { in: [...targetMembers] } },
      select: { memberUid: true, teamUid: true, endDate: true },
    }),
    prisma.teamNewsItem.findMany({
      where: { uid: { in: [...newsUids] } },
      select: { uid: true, teamUid: true, tags: true },
    }),
    prisma.jobOpening.findMany({ where: { uid: { in: [...jobUids] } }, select: { uid: true, teamUid: true } }),
  ]);

  const teamUids = new Set<string>();
  for (const s of signals) if (s.entityType === 'TEAM') teamUids.add(s.entityUid);
  for (const r of [...roles, ...targetRoles]) teamUids.add(r.teamUid);
  for (const n of newsRows) teamUids.add(n.teamUid);
  for (const j of jobRows) if (j.teamUid) teamUids.add(j.teamUid);
  for (const r of referrals) if (r.jobOpening?.teamUid) teamUids.add(r.jobOpening.teamUid);

  const [teamAreas, projectAreas] = await Promise.all([
    prisma.teamFocusArea.findMany({
      where: { teamUid: { in: [...teamUids] } },
      select: { teamUid: true, focusArea: { select: { title: true } }, ancestorArea: { select: { title: true } } },
    }),
    prisma.projectFocusArea.findMany({
      where: { projectUid: { in: [...projectUids] } },
      select: { projectUid: true, focusArea: { select: { title: true } }, ancestorArea: { select: { title: true } } },
    }),
  ]);

  const teamTopics = groupTopics(teamAreas.map((a) => [a.teamUid, a.focusArea.title, a.ancestorArea.title]));
  const projectTopics = groupTopics(projectAreas.map((a) => [a.projectUid, a.focusArea.title, a.ancestorArea.title]));
  const excludedTargets = new Set(
    [...targetMembers].filter((uid) => {
      const row = targetRows.find((m) => m.uid === uid);
      return !row || !!row.deletedAt || isExcludedMember(row);
    })
  );
  const memberTeams = groupBy(
    targetRoles.filter((r) => isCurrentRole(r.endDate, now)),
    (r) => r.memberUid,
    (r) => r.teamUid
  );
  const news = new Map(newsRows.map((n) => [n.uid, { teamUid: n.teamUid, tags: n.tags }]));
  const jobs = new Map(jobRows.map((j) => [j.uid, j.teamUid ?? undefined]));

  const lookups: ProfileLookups = {
    teamTopics: (uid) => teamTopics.get(uid) ?? [],
    projectTopics: (uid) => projectTopics.get(uid) ?? [],
    memberTeams: (uid) => memberTeams.get(uid) ?? [],
    newsItem: (uid) => news.get(uid),
    jobTeam: (uid) => jobs.get(uid),
    isTopic: (slug) => vocabulary.has(slug),
    slugify: (value) => slugify(value),
    isExcludedMember: (uid) => excludedTargets.has(uid),
  };

  const signalsBy = groupBy(
    signals,
    (s) => s.memberUid,
    (s) => s
  );
  const rolesBy = groupBy(
    roles,
    (r) => r.memberUid,
    (r) => r
  );
  const meetingsBy = groupBy(
    meetings,
    (m) => m.sourceMemberUid,
    (m) => m
  );
  const guestsBy = groupBy(
    guests,
    (g) => g.memberUid,
    (g) => g
  );
  const referralsBy = groupBy(
    referrals,
    (r) => r.referrerMemberUid,
    (r) => r
  );
  const postsBy = groupBy(
    ownPosts,
    (p) => p.postedByMemberUid as string,
    (p) => p
  );

  const sources = members.map((member): ProfileSources => {
    const memberRoles = rolesBy.get(member.uid) ?? [];
    return {
      memberUid: member.uid,
      currentTeamUids: memberRoles.filter((r) => isCurrentRole(r.endDate, now)).map((r) => r.teamUid),
      pastTeams: memberRoles
        .filter((r) => !isCurrentRole(r.endDate, now))
        .map((r) => ({ teamUid: r.teamUid, endDate: r.endDate as Date })),
      signals: signalsBy.get(member.uid) ?? [],
      heldMeetings: (meetingsBy.get(member.uid) ?? []).map((m) => ({
        targetMemberUid: m.targetMemberUid as string,
        createdAt: m.createdAt,
      })),
      eventTopics: (guestsBy.get(member.uid) ?? []).map((g) => ({ topics: g.topics, createdAt: g.createdAt })),
      referrals: (referralsBy.get(member.uid) ?? []).map((r) => ({
        referredMemberUid: r.referredMemberUid,
        jobTeamUid: r.jobOpening?.teamUid ?? null,
        createdAt: r.createdAt,
      })),
      declaredInterests: [...member.skills.map((s) => s.title), ...member.customSkills, ...member.ohInterest],
      savedNewsTags: readStoredNewsTags(member.preferences) ?? [],
      ownPosts: (postsBy.get(member.uid) ?? []).map((p) => ({ tags: p.tags, createdAt: p.createdAt })),
    };
  });

  return { sources, lookups };
}

function groupTopics(rows: [string, string, string][]): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const [uid, focusArea, ancestor] of rows) {
    const set = out.get(uid) ?? new Set<string>();
    set.add(slugify(focusArea));
    set.add(slugify(ancestor));
    out.set(uid, set);
  }
  return new Map([...out].map(([uid, set]) => [uid, [...set]]));
}

function groupBy<T, V>(rows: T[], key: (row: T) => string, value: (row: T) => V): Map<string, V[]> {
  const out = new Map<string, V[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k) ?? [];
    list.push(value(row));
    out.set(k, list);
  }
  return out;
}

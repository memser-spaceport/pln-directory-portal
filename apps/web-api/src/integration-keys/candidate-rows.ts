import { Prisma } from '@prisma/client';
import { memberProfileUrl } from '../job-openings/job-openings-url';

/**
 * The candidate rows an integrated ATS consumes, and the Prisma selects that
 * produce them.
 *
 * The feed and the push both map through here, so a row delivered the instant
 * a member applies is the same row the ATS would later read from the cursor
 * feed. If the two ever describe an application differently, the ATS has two
 * sources of truth for the same uid.
 */

export interface CandidateProfileSnapshot {
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  tags: string[];
}

export interface CandidateApplicationRow {
  uid: string;
  jobUid: string;
  jobTitle: string;
  jobUrl: string | null;
  memberUid: string;
  name: string;
  email: string | null;
  profileUrl: string;
  coverLetter: string | null;
  profileSnapshot: CandidateProfileSnapshot;
  cvUrl?: string;
  appliedAt: string;
}

export interface CandidateInterestRow {
  uid: string;
  /** Null for interest in the team itself rather than in one of its roles. */
  jobUid: string | null;
  jobTitle: string | null;
  memberUid: string;
  name: string;
  email: string | null;
  profileUrl: string;
  profileSnapshot: CandidateProfileSnapshot;
  interestedAt: string;
}

const memberSelect = {
  uid: true,
  name: true,
  email: true,
  skills: { select: { title: true } },
  location: { select: { city: true, country: true, region: true } },
  teamMemberRoles: { select: { role: true, mainTeam: true, team: { select: { name: true } } } },
} as const;

export const applicationSelect = {
  uid: true,
  coverLetter: true,
  createdAt: true,
  updatedAt: true,
  jobOpening: { select: { uid: true, roleTitle: true, sourceLink: true, teamUid: true } },
  member: { select: memberSelect },
} as const;

export const jobInterestSelect = {
  uid: true,
  createdAt: true,
  updatedAt: true,
  jobOpening: { select: { uid: true, roleTitle: true, teamUid: true } },
  member: { select: memberSelect },
} as const;

export const teamInterestSelect = {
  uid: true,
  teamUid: true,
  createdAt: true,
  updatedAt: true,
  member: { select: memberSelect },
} as const;

export type ApplicationSource = Prisma.JobApplicationGetPayload<{ select: typeof applicationSelect }>;
export type JobInterestSource = Prisma.JobOpeningInterestGetPayload<{ select: typeof jobInterestSelect }>;
export type TeamInterestSource = Prisma.TeamInterestGetPayload<{ select: typeof teamInterestSelect }>;

type MemberSource = ApplicationSource['member'];

/**
 * One snapshot shape for every row. `JobApplication.profileSnapshot` is NOT used:
 * it is a point-in-time record shaped for the application email (a nested location
 * object, full experience list), and an integration reading `location` as a string
 * rejects it. This describes the person as they are now, the same way for an
 * application and for an interest.
 */
function snapshotOf(member: MemberSource): CandidateProfileSnapshot {
  const main = member.teamMemberRoles.find((r) => r.mainTeam) ?? member.teamMemberRoles[0];
  const place = [member.location?.city, member.location?.region, member.location?.country].filter(Boolean).join(', ');
  return {
    headline: main?.role?.trim() || null,
    location: place || null,
    currentCompany: main?.team.name ?? null,
    tags: member.skills.map((s) => s.title).slice(0, 8),
  };
}

export function toApplicationRow(row: ApplicationSource, cvUrl: string | null): CandidateApplicationRow {
  return {
    uid: row.uid,
    jobUid: row.jobOpening.uid,
    jobTitle: row.jobOpening.roleTitle,
    jobUrl: row.jobOpening.sourceLink,
    memberUid: row.member.uid,
    name: row.member.name,
    email: row.member.email,
    profileUrl: memberProfileUrl(row.member.uid),
    coverLetter: row.coverLetter,
    profileSnapshot: snapshotOf(row.member),
    ...(cvUrl ? { cvUrl } : {}),
    appliedAt: row.createdAt.toISOString(),
  };
}

export function toJobInterestRow(row: JobInterestSource): CandidateInterestRow {
  return {
    uid: row.uid,
    jobUid: row.jobOpening.uid,
    jobTitle: row.jobOpening.roleTitle,
    memberUid: row.member.uid,
    name: row.member.name,
    email: row.member.email,
    profileUrl: memberProfileUrl(row.member.uid),
    profileSnapshot: snapshotOf(row.member),
    interestedAt: row.createdAt.toISOString(),
  };
}

export function toTeamInterestRow(row: TeamInterestSource): CandidateInterestRow {
  return {
    uid: row.uid,
    jobUid: null,
    jobTitle: null,
    memberUid: row.member.uid,
    name: row.member.name,
    email: row.member.email,
    profileUrl: memberProfileUrl(row.member.uid),
    profileSnapshot: snapshotOf(row.member),
    interestedAt: row.createdAt.toISOString(),
  };
}

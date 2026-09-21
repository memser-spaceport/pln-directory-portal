import { Prisma } from '@prisma/client';
import type { ApplicantCv, ApplicantRow } from 'libs/contracts/src/schema/team-hiring';
import { memberProfileUrl } from '../job-openings/job-openings-url';

/**
 * The rows the team applicants page draws, and the Prisma selects behind them.
 *
 * Deliberately NOT the ATS feed's `integration-keys/candidate-rows.ts`: that
 * shape is a contract an integrated ATS vendors, nests `profileSnapshot` and
 * carries a signed `cvUrl`, while this one is flat and carries file metadata
 * without a link. What the two share is the member select, the CV read and the
 * profile-URL builder.
 */

const memberSelect = {
  uid: true,
  name: true,
  email: true,
  image: { select: { url: true } },
  skills: { select: { title: true } },
  location: { select: { city: true, country: true, region: true } },
  teamMemberRoles: { select: { role: true, mainTeam: true, team: { select: { name: true } } } },
} as const;

const reviewSelect = { reviewedAt: true, reviewedByUid: true } as const;

export const applicantApplicationSelect = {
  uid: true,
  coverLetter: true,
  createdAt: true,
  ...reviewSelect,
  member: { select: memberSelect },
} as const;

export const applicantInterestSelect = {
  uid: true,
  createdAt: true,
  ...reviewSelect,
  member: { select: memberSelect },
} as const;

/** Just enough per row to tally a role: when it happened and whose face to show. */
export const applicantTallySelect = {
  uid: true,
  jobOpeningUid: true,
  createdAt: true,
  member: { select: { image: { select: { url: true } } } },
} as const;

export type ApplicantApplicationSource = Prisma.JobApplicationGetPayload<{
  select: typeof applicantApplicationSelect;
}>;
export type ApplicantInterestSource = Prisma.JobOpeningInterestGetPayload<{
  select: typeof applicantInterestSelect;
}>;

type MemberSource = ApplicantApplicationSource['member'];

function person(member: MemberSource) {
  const main = member.teamMemberRoles.find((r) => r.mainTeam) ?? member.teamMemberRoles[0];
  const place = [member.location?.city, member.location?.region, member.location?.country].filter(Boolean).join(', ');
  return {
    memberUid: member.uid,
    name: member.name,
    email: member.email,
    profileUrl: memberProfileUrl(member.uid),
    avatarUrl: member.image?.url ?? null,
    headline: main?.role?.trim() || null,
    currentCompany: main?.team.name ?? null,
    location: place || null,
    tags: member.skills.map((s) => s.title),
  };
}

export function toApplicationRow(
  row: ApplicantApplicationSource,
  cv: ApplicantCv | null,
  unseen: boolean
): ApplicantRow {
  return {
    ...person(row.member),
    uid: row.uid,
    createdAt: row.createdAt.toISOString(),
    coverLetter: row.coverLetter,
    cv,
    unseen,
    reviewed: row.reviewedAt !== null,
  };
}

/**
 * An interest carries neither a note nor a document: the press has no words, and
 * the CV read only admits a lead to the CV of somebody who actually applied, so
 * naming a file here would advertise one the lead is then refused.
 */
export function toInterestRow(row: ApplicantInterestSource, unseen: boolean): ApplicantRow {
  return {
    ...person(row.member),
    uid: row.uid,
    createdAt: row.createdAt.toISOString(),
    coverLetter: null,
    cv: null,
    unseen,
    reviewed: row.reviewedAt !== null,
  };
}

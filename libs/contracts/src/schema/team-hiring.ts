import { z } from 'zod';

/**
 * What a team lead reads and writes about their own applicants.
 *
 * This mirrors `schema/team-applicants.ts` in `pln-directory-portal-v2` FIELD FOR
 * FIELD. That schema is `.strict()`, so a key added here and not there fails the
 * client's parse rather than arriving unused — keep the two in step, and prefer
 * changing both in one go over sending something "harmless" extra.
 *
 * Not the ATS feed's shape (`integration-key.ts` and the integration candidate
 * rows): that one nests `profileSnapshot`, names the act `appliedAt`/`interestedAt`
 * and carries a signed `cvUrl`. Two consumers, two contracts — see the change's
 * design doc, decision 4.
 */

/** Which table a triage write addresses. The URL segment, so plural. */
export const HIRING_CANDIDATE_KINDS = ['applications', 'interests'] as const;
export const HiringCandidateKindSchema = z.enum(HIRING_CANDIDATE_KINDS);
export type HiringCandidateKind = z.infer<typeof HiringCandidateKindSchema>;

/**
 * The CV an application was made with: named and sized, with no URL.
 *
 * The link expires, so the file is fetched when a reader asks for it — the
 * existing `GET /v1/members/:uid/cv-imports/latest` already serves a lead a
 * signed link for a member who applied to one of their roles.
 */
export const ApplicantCvSchema = z.object({
  fileName: z.string(),
  size: z.number().int().nonnegative().optional(),
  uploadedAt: z.string(),
});
export type ApplicantCv = z.infer<typeof ApplicantCvSchema>;

/**
 * One person in one of the two lists — the same shape for an application and an
 * interest, because the page draws them in the same row and the same pane.
 *
 * Deliberately thin: the whole member profile is NOT here, so this list cannot
 * drift from what `/members/:uid` says about the same person.
 *
 * No `kind`: the response envelope already separates the two lists, and the
 * client's `.strict()` would reject the repetition.
 */
export const ApplicantRowSchema = z.object({
  /** The application's or interest's own uid — what the two writes address. */
  uid: z.string(),
  memberUid: z.string(),
  name: z.string(),
  /** Null when the member has no email on record; the Email control hides itself. */
  email: z.string().nullable(),
  profileUrl: z.string(),
  /** Null for a member with no picture; the row draws initials instead. */
  avatarUrl: z.string().nullable(),
  /** Their CURRENT role, not the one they applied for. */
  headline: z.string().nullable(),
  currentCompany: z.string().nullable(),
  /** A single string, not a nested place. */
  location: z.string().nullable(),
  tags: z.array(z.string()),
  /** ISO. The applied time or the interested time, under one name. */
  createdAt: z.string(),
  /** Always null on an interest: the press carries no words. */
  coverLetter: z.string().nullable(),
  /** Always null on an interest too — an interest carries no document. */
  cv: ApplicantCvSchema.nullable(),
  /** Not opened by THIS viewer. Per lead, not per row. */
  unseen: z.boolean(),
  /** The TEAM's tick, shared by every lead. Not a pipeline stage. */
  reviewed: z.boolean(),
});
export type ApplicantRow = z.infer<typeof ApplicantRowSchema>;

/** One role's tallies, for the profile's count line and the picker's badge. */
export const ApplicantCountSchema = z.object({
  roleUid: z.string(),
  applicantCount: z.number().int().nonnegative(),
  interestCount: z.number().int().nonnegative(),
  /** Unopened by this viewer, across BOTH lists. */
  newCount: z.number().int().nonnegative(),
  /**
   * Up to three avatar URLs, newest first, across both lists. URLs only: a face
   * is all the line shows, and a name here would put the people who applied on a
   * page the lead's teammates read over their shoulder. Members with no picture
   * are skipped rather than sent as nulls.
   */
  newestAvatars: z.array(z.string()).max(3),
});
export type ApplicantCount = z.infer<typeof ApplicantCountSchema>;

/**
 * Counts for every open role somebody answered.
 *
 * Counts only — the roles themselves come from the jobs list the team profile
 * already fetches, and repeating their titles here would be a second description
 * of a posting. A role absent from `counts` has nobody: the list is complete, so
 * absence is an answer rather than an unknown.
 */
export const ApplicantCountsResponseSchema = z.object({
  counts: z.array(ApplicantCountSchema),
});
export type ApplicantCountsResponse = z.infer<typeof ApplicantCountsResponseSchema>;

/** One role's two lists, newest first, unpaged. */
export const RoleApplicantsResponseSchema = z.object({
  applications: z.array(ApplicantRowSchema),
  interests: z.array(ApplicantRowSchema),
});
export type RoleApplicantsResponse = z.infer<typeof RoleApplicantsResponseSchema>;

export const ApplicantReviewedBodySchema = z.object({
  reviewed: z.boolean(),
});
export type ApplicantReviewedBody = z.infer<typeof ApplicantReviewedBodySchema>;

/**
 * The state as stored after the write, which is what makes it worth answering:
 * the caller corrects its screen from the server rather than from what it assumed
 * the press meant.
 */
export const ApplicantReviewedResponseSchema = z.object({
  uid: z.string(),
  reviewed: z.boolean(),
});
export type ApplicantReviewedResponse = z.infer<typeof ApplicantReviewedResponseSchema>;

/** Marking a row opened. Idempotent; the first `seenAt` stands. */
export const ApplicantSeenResponseSchema = z.object({
  uid: z.string(),
  seenAt: z.string(),
});
export type ApplicantSeenResponse = z.infer<typeof ApplicantSeenResponseSchema>;

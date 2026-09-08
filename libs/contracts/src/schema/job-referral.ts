import { z } from 'zod';

export const JobReferralRecipientSchema = z
  .object({
    memberUid: z.string().min(1).optional(),
    email: z.string().email().optional(),
    name: z.string().min(1).max(200).optional(),
  })
  .refine((recipient) => Boolean(recipient.memberUid || recipient.email), {
    message: 'Each recipient must include a memberUid or an email',
  });

// The person being referred when they aren't a Directory member. Name, email, and LinkedIn
// profile are all required (LAB-2509) — an email that happens to match an existing member is
// still treated as an outside referral rather than being resolved to that member.
export const ReferredExternalPersonSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  linkedinUrl: z.string().trim().min(1).max(300),
});

export type ReferredExternalPersonInput = z.infer<typeof ReferredExternalPersonSchema>;

export const CreateJobReferralSchema = z
  .object({
    referredMemberUid: z.string().min(1).optional(),
    referredPerson: ReferredExternalPersonSchema.optional(),
    recipients: z.array(JobReferralRecipientSchema).max(20).optional().default([]),
    note: z.string().min(1).max(5000),
    // Whether the referred person is CCed on the referral email. Checked by default in the
    // modal — this preserves prior behaviour when a caller omits it. When false, they get a
    // separate notification email instead (see JobOpeningsReferralService.referJob).
    includeReferredMember: z.boolean().optional().default(true),
  })
  .refine((input) => Boolean(input.referredMemberUid) !== Boolean(input.referredPerson), {
    message: 'Provide exactly one of referredMemberUid or referredPerson',
  });

export type CreateJobReferralInput = z.infer<typeof CreateJobReferralSchema>;

export const JobReferralResponseSchema = z.object({
  uid: z.string(),
  jobUid: z.string(),
  to: z.string().email(),
  cc: z.array(z.string().email()),
  sentAt: z.string(),
});

export const JobReferralDraftQuerySchema = z
  .object({
    referredMemberUid: z.string().min(1).optional(),
    // Only the name is needed to draft the note's opening line for an outside referral —
    // email/LinkedIn aren't used in the drafted text itself.
    referredName: z.string().trim().min(1).max(200).optional(),
  })
  .refine((input) => Boolean(input.referredMemberUid) !== Boolean(input.referredName), {
    message: 'Provide exactly one of referredMemberUid or referredName',
  });

// Pre-filled "Your note" text for the referral modal, plus the resolved facts
// it was built from, so the UI doesn't need a second lookup to show them elsewhere.
export const JobReferralDraftResponseSchema = z.object({
  note: z.string(),
  referrerName: z.string(),
  referrerTitle: z.string().nullable(),
  referrerCompany: z.string().nullable(),
  referredName: z.string(),
  referredTitle: z.string().nullable(),
  referredCompany: z.string().nullable(),
  roleTitle: z.string(),
  teamName: z.string(),
  applyUrl: z.string().nullable(),
});

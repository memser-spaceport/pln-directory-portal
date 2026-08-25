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

export const CreateJobReferralSchema = z.object({
  referredMemberUid: z.string().min(1),
  recipients: z.array(JobReferralRecipientSchema).max(20).optional().default([]),
  note: z.string().min(1).max(5000),
});

export type CreateJobReferralInput = z.infer<typeof CreateJobReferralSchema>;

export const JobReferralResponseSchema = z.object({
  uid: z.string(),
  jobUid: z.string(),
  to: z.string().email(),
  cc: z.array(z.string().email()),
  sentAt: z.string(),
});

export const JobReferralDraftQuerySchema = z.object({
  referredMemberUid: z.string().min(1),
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

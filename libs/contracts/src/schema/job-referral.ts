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
  recipients: z.array(JobReferralRecipientSchema).min(1).max(20),
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

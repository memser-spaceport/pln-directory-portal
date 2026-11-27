import { z } from 'zod';

/** `GET /v1/members/me/invite-link` (LAB-3396): the signed-in member's reusable invite link. */
export const MemberInviteLinkSchema = z.object({
  inviteCode: z.string(),
  inviteUrl: z.string().url(),
});

export type MemberInviteLink = z.infer<typeof MemberInviteLinkSchema>;

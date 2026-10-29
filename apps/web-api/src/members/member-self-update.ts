import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * The fields `PATCH /v1/members/:uid` may write. The body goes to
 * `prisma.member.update`, so any key outside this list (accessLevel, email,
 * externalId, relations, ...) is refused with a 400 instead of being written.
 * Profile changes beyond these fields go through `PUT /v1/member/:uid`.
 */
export const MemberSelfUpdateSchema = z
  .object({
    bio: z.string().nullable(),
    isSubscribedToNewsletter: z.boolean(),
    officeHours: z.string().nullable(),
    ohInterest: z.array(z.string()),
    ohHelpWith: z.array(z.string()),
    jobSearchStatus: z.string().nullable(),
  })
  .partial()
  .strict();

export type MemberSelfUpdate = z.infer<typeof MemberSelfUpdateSchema>;

export function parseMemberSelfUpdate(body: unknown): MemberSelfUpdate {
  const parsed = MemberSelfUpdateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid member update payload');
  }
  return parsed.data;
}

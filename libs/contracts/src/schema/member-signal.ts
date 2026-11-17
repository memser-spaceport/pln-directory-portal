import { z } from 'zod';

/**
 * Views and clicks a logged-in member's browser reports to the member signal
 * log (LAB-3123, LAB-3267). The member is always taken from the session, never the body.
 */
export const MemberSignalClientActionSchema = z.enum([
  'view',
  'contact-click',
  'contact-copy',
  'team-contact-click',
  'project-link-click',
  'github-project-click',
  'search-result-click',
  'job-apply-click',
]);
export type MemberSignalClientAction = z.infer<typeof MemberSignalClientActionSchema>;

export const MemberSignalClientEntityTypeSchema = z.enum([
  'member',
  'team',
  'project',
  'news-item',
  'job-opening',
  'event',
]);
export type MemberSignalClientEntityType = z.infer<typeof MemberSignalClientEntityTypeSchema>;

/** Which entity types each action may target. */
export const MEMBER_SIGNAL_ALLOWED_PAIRS: Readonly<
  Record<MemberSignalClientAction, readonly MemberSignalClientEntityType[]>
> = {
  // A click through to a news item's source is sent as a `view` of the item.
  view: ['member', 'team', 'project', 'news-item', 'job-opening', 'event'],
  'search-result-click': ['member', 'team', 'project', 'event'],
  'contact-click': ['member'],
  'contact-copy': ['member'],
  'github-project-click': ['member'],
  'team-contact-click': ['team'],
  'project-link-click': ['project'],
  'job-apply-click': ['job-opening'],
};

export const MemberSignalBodySchema = z
  .object({
    action: MemberSignalClientActionSchema,
    entityType: MemberSignalClientEntityTypeSchema,
    entityId: z.string().trim().min(1).max(64),
  })
  .strict()
  .refine((body) => MEMBER_SIGNAL_ALLOWED_PAIRS[body.action].includes(body.entityType), {
    message: 'action is not allowed for this entityType',
    path: ['entityType'],
  });
export type MemberSignalBody = z.infer<typeof MemberSignalBodySchema>;

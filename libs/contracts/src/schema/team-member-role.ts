import { z } from 'zod';
import { ResponseMemberSchema, ResponseTeamSchema } from './index';

export const TeamMemberRoleSchema = z.object({
  id: z.number().int(),
  role: z.string(),
  mainTeam: z.boolean(),
  teamLead: z.boolean(),
  memberUid: z.string(),
  teamUid: z.string()
});

export const ResponseTeamMemberRoleSchema = TeamMemberRoleSchema.extend({
  member: z.lazy(() => ResponseMemberSchema).optional(),
  team: z.lazy(() => ResponseTeamSchema).optional(),
})
  .omit({
    id: true,
    memberUid: true,
    teamUid: true,
  })
  .strict();

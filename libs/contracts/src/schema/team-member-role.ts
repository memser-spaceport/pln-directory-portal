import { z } from 'zod';
import { ResponseMemberSchema } from './member';
import { ResponseRoleSchema } from './role';
import { ResponseTeamSchema } from './team';

export const TeamMemberRoleSchema = z.object({
  id: z.number().int(),
  mainRole: z.boolean(),
  teamLead: z.boolean(),
  memberId: z.number().int(),
  teamId: z.number().int(),
  roleId: z.number().int(),
});

export const ResponseTeamMemberRoleSchema = TeamMemberRoleSchema.extend({
  member: z.lazy(() => ResponseTeamSchema),
  team: z.lazy(() => ResponseMemberSchema),
  role: ResponseRoleSchema,
})
  .omit({
    id: true,
    memberId: true,
    teamId: true,
    roleId: true,
  })
  .strict();

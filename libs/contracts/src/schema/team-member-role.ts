import { z } from 'zod';
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
  team: z.lazy(() => ResponseTeamSchema),
  role: ResponseRoleSchema,
})
  .omit({
    id: true,
    memberId: true,
    teamId: true,
    roleId: true,
  })
  .strict();

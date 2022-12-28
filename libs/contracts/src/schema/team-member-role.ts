import { z } from 'zod';
import {
  ResponseMemberSchema,
  ResponseTeamSchema,
  ResponseRoleSchema,
} from './index';

export const TeamMemberRoleSchema = z.object({
  id: z.number().int(),
  mainRole: z.boolean(),
  teamLead: z.boolean(),
  memberId: z.number().int(),
  teamId: z.number().int(),
  roleId: z.number().int(),
});

export const ResponseTeamMemberRoleSchema = TeamMemberRoleSchema.extend({
  member: z.lazy(() => ResponseMemberSchema).optional(),
  team: z.lazy(() => ResponseTeamSchema).optional(),
  role: z.lazy(() => ResponseRoleSchema).optional(),
})
  .omit({
    id: true,
    memberId: true,
    teamId: true,
    roleId: true,
  })
  .strict();

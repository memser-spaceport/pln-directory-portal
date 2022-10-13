import { z } from 'zod';

export const TeamMemberRoleSchema = z.object({
  id: z.number().int(),
  mainRole: z.boolean(),
  teamLead: z.boolean(),
  memberId: z.number().int(),
  teamId: z.number().int(),
  roleId: z.number().int(),
});

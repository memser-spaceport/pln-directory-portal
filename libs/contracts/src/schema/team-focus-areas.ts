import { z } from 'zod';
import { ResponseTeamSchema, ResponseFocusAreaSchema } from './index';

export const TeamFocusAreaSchema = z.object({
  id: z.number().int(),
  teamUid: z.string(),
  focusAreaUid: z.string(),
  ancestorAreaUid: z.string()
});

export const ResponseTeamFocusAreaSchema = TeamFocusAreaSchema.extend({
  team: z.lazy(() => ResponseTeamSchema).optional(),
  focusArea: z.lazy(() => ResponseFocusAreaSchema).optional(),
  ancestorArea: z.lazy(()=> ResponseFocusAreaSchema).optional()
})
.omit({
  id: true,
  teamUid: true,
  focusAreaUid: true, 
  ancestorAreaUid: true
})
.strict();

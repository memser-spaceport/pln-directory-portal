import { z } from 'zod';
import { ResponseFocusAreaSchema } from './index';

export const ProjectFocusAreaSchema = z.object({
    id: z.number().int(),
    projectUid: z.string(),
    focusAreaUid: z.string(),
    ancestorAreaUid: z.string()
});

export const ResponseProjectFocusAreaSchema = ProjectFocusAreaSchema.extend({
  focusArea: z.lazy(() => ResponseFocusAreaSchema).optional(),
  ancestorArea: z.lazy(()=> ResponseFocusAreaSchema).optional()
})
.omit({
  id: true,
  projectUid: true,
  focusAreaUid: true, 
  ancestorAreaUid: true
})
.strict();

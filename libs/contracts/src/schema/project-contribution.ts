import { z } from 'zod';

export const ProjectContributionSchema = z.object({
  role: z.string(),
  currentProject: z.boolean(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  description: z.string().optional(),
  projectUid: z.string(),
  uid: z.string().optional()
}).superRefine((data, ctx) => {
  
  if(!data.currentProject && !data.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should not be null for past contribution',
      fatal: true,
    });
  }

  if(data.startDate && data.endDate && new Date(data.startDate).getTime() >= new Date(data.endDate).getTime() ){
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should be greater than start date',
      fatal: true,
    });
  }

  if(data.startDate  && new Date(data.startDate).getTime() >= Date.now() ){
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Start date should be less than or equal to current date',
      fatal: true,
    });
  }

  if(data.endDate  && new Date(data.endDate).getTime() > Date.now() ){
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should be less than or equal to current date',
      fatal: true,
    });
  }

  return z.never;
});